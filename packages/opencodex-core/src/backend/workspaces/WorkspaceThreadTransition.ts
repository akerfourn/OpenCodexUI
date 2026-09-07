import path from "node:path";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { verifyWorkspaceResume, type WorkspaceResumeExpectation, type WorkspaceResumeResponse } from
  "./workspaceResumeVerification.js";

/** Source-bound RPC methods used by the transition; no global active client is consulted. */
export type WorkspaceTransitionClient = Pick<CodexAppServerClient,
  "getMetadata" | "readThread" | "unsubscribeThread" | "resumeThread">;

/** Failure state tells the future durable coordinator whether Codex may have changed. */
export class WorkspaceTransitionError extends Error {
  /** True after dispatch begins, including lost responses and verification failures. */
  readonly requiresReconciliation: boolean;

  /** Preserves the original failure while exposing the transition's uncertainty. */
  constructor(cause: unknown, requiresReconciliation: boolean) {
    const message = cause instanceof Error ? cause.message : "Workspace transition failed.";
    super(message, { cause });
    this.name = "WorkspaceTransitionError";
    this.requiresReconciliation = requiresReconciliation;
  }
}

/**
 * Runs the tested RPC sequence under a caller-owned durable transition reservation.
 * This primitive does not select a workspace, generate config, stop processes or retry.
 */
export class WorkspaceThreadTransition {
  /** The caller supplies the client belonging to the reserved workspace's source. */
  constructor(private readonly client: WorkspaceTransitionClient) {}

  /**
   * Verifies a resume projection after unsubscribe. The caller must hold its thread gate,
   * validate process/child lifecycle, prepare config, and persist dispatch in beforeDispatch.
   * Success is not proof of full split-policy reload or durable cwd persistence.
   */
  async resume(
    threadId: string,
    expectation: WorkspaceResumeExpectation,
    beforeDispatch: () => Promise<void>
  ): Promise<WorkspaceResumeResponse> {
    let dispatched = false;
    try {
      // Freeze caller-owned arrays before any asynchronous operation.
      const expected = structuredClone(expectation);
      validateExpectation(threadId, expected);
      const metadata = await this.client.getMetadata(expected.cwd);
      if (metadata.isDirectory !== true) {
        throw new Error("Destination workspace is not an available directory.");
      }
      const { thread } = await this.client.readThread(threadId, false);
      const status = thread.status?.type;
      if (thread.id !== threadId || (status !== "idle" && status !== "notLoaded")) {
        throw new Error("Thread is active or its execution status is unknown.");
      }
      if (thread.canAcceptDirectInput === false
        || (typeof thread.source === "object" && thread.source !== null && "subagent" in thread.source)) {
        throw new Error("Sub-agent threads cannot be transitioned independently.");
      }
      await beforeDispatch();
      dispatched = true;
      const unsubscribe = await this.client.unsubscribeThread(threadId);
      if (unsubscribe.status !== "unsubscribed" && unsubscribe.status !== "notLoaded"
        && unsubscribe.status !== "notSubscribed") {
        throw new Error("Codex returned an unsupported unsubscribe response.");
      }
      const response = await this.client.resumeThread(threadId, {
        cwd: expected.cwd,
        runtimeWorkspaceRoots: expected.runtimeWorkspaceRoots,
        permissions: expected.activePermissionProfile.id,
        approvalPolicy: expected.approvalPolicy,
        approvalsReviewer: expected.approvalsReviewer,
        ...(expected.config === undefined ? {} : { config: expected.config }),
        excludeTurns: true
      });
      verifyWorkspaceResume(threadId, expected, response);
      return response;
    } catch (error) {
      throw new WorkspaceTransitionError(error, dispatched);
    }
  }
}

/** Fails before I/O for unsupported policy contracts or host-relative paths. */
function validateExpectation(threadId: string, expected: WorkspaceResumeExpectation): void {
  if (threadId.trim().length === 0 || expected.activePermissionProfile.id.trim().length === 0) {
    throw new Error("Workspace transition requires a thread and named permission profile.");
  }
  const paths = [expected.cwd, ...expected.runtimeWorkspaceRoots, ...expected.sandbox.writableRoots];
  for (const value of paths) {
    const isPosix = value.startsWith("/");
    const isWindows = /^[a-zA-Z]:[\\/]/u.test(value) || value.startsWith("\\\\");
    if (value.trim() !== value || (!isPosix && !isWindows)
      || !(path.posix.isAbsolute(value) || path.win32.isAbsolute(value))) {
      throw new Error("Workspace paths must be absolute in the source filesystem.");
    }
  }
  if (expected.sandbox.type !== "workspaceWrite" || !expected.runtimeWorkspaceRoots.includes(expected.cwd)) {
    throw new Error("Workspace transition requires a workspace-write policy and the destination root.");
  }
}
