import type { v2 } from "@open-codex-ui/codex-rpc";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceExecutionReservation } from "@open-codex-ui/opencodex-cache";
import type { WorkspaceCacheRepository, WorkspaceTransitionRecord } from "@open-codex-ui/opencodex-cache";
import type { ClientPort } from "../runtime/runtimePorts.js";
import { WorkspaceThreadTransition } from "./WorkspaceThreadTransition.js";
import type { WorkspaceResumeExpectation } from "./workspaceResumeVerification.js";

/** Backend-only preparation and lifecycle validation; never supplied by UI request payloads. */
export interface WorkspaceSelectionPreparation {
  /** Prepares a new conversation directly; no rollout exists yet to resume. */
  prepareCreation?(reservation: WorkspaceExecutionReservation,
    primary: OpenCodexProjectWorkspace): Promise<Partial<v2.ThreadStartParams>>;
  /** Must reject unsupported config reload, live processes/children and source capabilities. */
  requireSupported(transition: WorkspaceTransitionRecord): Promise<void>;
  /** Materializes destination configuration and returns its independently expected RPC projection. */
  prepare(transition: WorkspaceTransitionRecord): Promise<WorkspaceResumeExpectation>;
}

/** Coordinates durable selection while the enclosing execution service holds its local thread gate. */
export class WorkspaceSelectionService {
  /** Uses source-explicit clients and refuses effective switching until preparation is supported. */
  constructor(
    private readonly repository: WorkspaceCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly preparation?: WorkspaceSelectionPreparation
  ) {}

  /** Reserves both locations before preparing configuration or contacting Codex. */
  async select(threadId: string, workspaceId: string): Promise<void> {
    const current = await this.repository.getForThread(threadId);
    const pending = await this.repository.transitions.getForThread(threadId);
    if (pending !== null) {
      throw new Error("Thread has an unresolved workspace transition; reconcile before selecting.");
    }
    if (current?.id === workspaceId) {
      return;
    }
    this.requirePreparation();
    const transition = await this.repository.transitions.begin(threadId, workspaceId);
    try {
      const preparation = this.requirePreparation();
      await preparation.requireSupported(transition);
      const expected = await preparation.prepare(transition);
      await this.apply(transition, expected);
    } catch (error) {
      await this.repository.transitions.fail(transition.id);
      throw error;
    }
  }

  /** Explicitly recovers a pending transition; an idle response alone never releases dispatched state. */
  async reconcile(threadId: string): Promise<boolean> {
    const transition = await this.repository.transitions.getForThread(threadId);
    if (transition === null) {
      return false;
    }
    if (transition.state === "preparing") {
      await this.repository.transitions.fail(transition.id);
      return true;
    }
    try {
      const preparation = this.requirePreparation();
      await preparation.requireSupported(transition);
      // Re-materialize and compare against the frozen contract; never silently adopt new permissions.
      const expected = await preparation.prepare(transition);
      if (JSON.stringify(expected) !== transition.expectationJson) {
        throw new Error("Workspace permission contract changed; transition remains blocked.");
      }
      await this.apply(transition, expected);
      return true;
    } catch (error) {
      await this.repository.transitions.fail(transition.id);
      throw error;
    }
  }

  /** Commits only a verified resume, retaining the durable blocker if verification or commit fails. */
  private async apply(transition: WorkspaceTransitionRecord, expected: WorkspaceResumeExpectation): Promise<void> {
    const frozen = structuredClone(expected);
    if (frozen.cwd !== transition.toPath) {
      throw new Error("Prepared context does not match the reserved destination path.");
    }
    const client = await this.clients.ensureClient(transition.sourceId);
    const rpc = new WorkspaceThreadTransition(client);
    await rpc.resume(transition.threadId, frozen, async () => {
      await this.repository.transitions.submitting(transition.id, JSON.stringify(frozen));
    });
    await this.repository.transitions.commit(transition.id);
  }

  /** No cwd-only fallback is permitted when lifecycle/configuration integration is absent. */
  private requirePreparation(): WorkspaceSelectionPreparation {
    if (this.preparation === undefined) {
      throw new Error("Workspace switching is not enabled: configuration and lifecycle validation are not installed.");
    }
    return this.preparation;
  }
}
