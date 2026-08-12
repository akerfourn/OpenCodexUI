/**
 * Runs Git commands through the Codex app-server process API.
 */
import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";

import type { ClientPort } from "../runtime/runtimePorts.js";

/** Captures the process fields needed by Git command callers. */
export type GitProcessResult = Pick<
  v2.ProcessExitedNotification,
  "exitCode" | "stdout" | "stdoutCapReached" | "stderr" | "stderrCapReached"
>;

/** Controls failure handling, timeout, and output capture for one Git command. */
export type RunGitOptions = {
  allowFailure?: boolean;
  timeoutMs?: number;
  outputBytesCap?: number;
};

/** Runs one Git command in a source-owned project directory. */
export type RunGit = (
  projectPath: string,
  sourceId: string | null,
  args: string[],
  options?: RunGitOptions
) => Promise<GitProcessResult>;

/**
 * Creates a source-aware Git command runner.
 *
 * @param clients Minimal client resolver used to execute Git for a source.
 * @returns Function that runs Git through the resolved Codex client.
 */
export function createRunGit(clients: Pick<ClientPort, "ensureClient">): RunGit {
  return async function runGit(
    projectPath: string,
    sourceId: string | null,
    args: string[],
    options: RunGitOptions = {}
  ): Promise<GitProcessResult> {
    if (sourceId === null) {
      throw new Error("Git operations require a Codex source.");
    }

    const client = await clients.ensureClient(sourceId);
    const response = await runHostProcess(client, {
      command: ["git", ...args],
      cwd: projectPath,
      timeoutMs: options.timeoutMs ?? 30_000,
      outputBytesCap: options.outputBytesCap ?? 2_000_000
    });

    if (response.exitCode !== 0 && options.allowFailure !== true) {
      throw new Error(createGitErrorMessage(response));
    }

    return response;
  };
}

/**
 * Runs a host process through Codex and waits for its exit notification.
 *
 * @param client Codex app-server client.
 * @param params Process spawn params except the generated handle.
 * @returns Captured process result.
 */
export async function runHostProcess(
  client: CodexAppServerClient,
  params: Omit<v2.ProcessSpawnParams, "processHandle">
): Promise<GitProcessResult> {
  const processHandle = `opencodex-git-${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return await new Promise<GitProcessResult>((resolve, reject) => {
    const timeout = setTimeout(() => {
      subscription.dispose();
      reject(new Error(`Timed out waiting for Git process ${processHandle}.`));
    }, (params.timeoutMs ?? 30_000) + 5_000);
    const subscription = client.onNotification((notification) => {
      if (notification.method !== "process/exited") {
        return;
      }

      const exit = readProcessExitedNotification(notification.params);

      if (exit === null || exit.processHandle !== processHandle) {
        return;
      }

      clearTimeout(timeout);
      subscription.dispose();
      resolve(exit);
    });

    client.request<v2.ProcessSpawnResponse>("process/spawn", {
      ...params,
      processHandle
    }).catch((error: unknown) => {
      clearTimeout(timeout);
      subscription.dispose();
      reject(error);
    });
  });
}

/**
 * Reads a process exit notification with the fields required by Git.
 *
 * @param value Raw notification params.
 * @returns Process result, or `null` when the payload is invalid.
 */
export function readProcessExitedNotification(
  value: unknown
): v2.ProcessExitedNotification | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const params = value as Partial<v2.ProcessExitedNotification>;

  if (
    typeof params.processHandle !== "string" ||
    typeof params.exitCode !== "number" ||
    typeof params.stdout !== "string" ||
    typeof params.stderr !== "string"
  ) {
    return null;
  }

  return {
    processHandle: params.processHandle,
    exitCode: params.exitCode,
    stdout: params.stdout,
    stdoutCapReached: params.stdoutCapReached === true,
    stderr: params.stderr,
    stderrCapReached: params.stderrCapReached === true
  };
}

/**
 * Builds a user-facing error message from a failed Git process.
 *
 * @param response Failed process result.
 * @returns Error message.
 */
export function createGitErrorMessage(response: GitProcessResult): string {
  const message = [response.stderr, response.stdout]
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .join("\n");

  return message.length > 0 ? message : `Git exited with code ${response.exitCode}.`;
}
