/**
 * Runs Git commands in the filesystem owned by a Codex source.
 */
import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexGitCommitResult,
  OpenCodexGitStatus
} from "@open-codex-ui/opencodex-protocol";

import { parseGitStatus } from "./gitStatusParser.js";

type GitProcessResult = Pick<v2.ProcessExitedNotification, "exitCode" | "stdout" | "stderr">;

export type GitServiceOptions = {
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
};

/**
 * Coordinates Git operations through Codex app-server command execution.
 */
export class GitService {
  constructor(private readonly options: GitServiceOptions) {}

  /**
   * Reads repository status for a project.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @returns Parsed Git status.
   */
  async status(projectPath: string, sourceId: string | null): Promise<OpenCodexGitStatus> {
    const response = await this.runGit(projectPath, sourceId, [
      "status",
      "--porcelain=v2",
      "-z",
      "--branch"
    ], { allowFailure: true });

    if (response.exitCode !== 0 && isNotRepositoryResponse(response)) {
      return {
        isRepository: false,
        branchName: null,
        changedFiles: [],
        stagedFiles: []
      };
    }

    if (response.exitCode !== 0) {
      throw new Error(createGitErrorMessage(response));
    }

    return parseGitStatus(response.stdout);
  }

  /**
   * Stages selected paths.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param paths Relative paths to stage.
   * @returns Refreshed status.
   */
  async stage(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    await this.runGit(projectPath, sourceId, ["add", "--", ...normalizePaths(paths)]);
    return await this.status(projectPath, sourceId);
  }

  /**
   * Unstages selected paths.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param paths Relative paths to unstage.
   * @returns Refreshed status.
   */
  async unstage(
    projectPath: string,
    sourceId: string | null,
    paths: string[]
  ): Promise<OpenCodexGitStatus> {
    await this.runGit(projectPath, sourceId, ["restore", "--staged", "--", ...normalizePaths(paths)]);
    return await this.status(projectPath, sourceId);
  }

  /**
   * Creates a commit from staged files.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param message Commit message.
   * @returns Commit result output.
   */
  async commit(
    projectPath: string,
    sourceId: string | null,
    message: string
  ): Promise<OpenCodexGitCommitResult> {
    const normalizedMessage = message.trim();

    if (normalizedMessage.length === 0) {
      throw new Error("Commit message is required.");
    }

    const response = await this.runGit(projectPath, sourceId, ["commit", "-m", normalizedMessage]);

    return {
      ok: true,
      output: [response.stdout, response.stderr].filter((entry) => entry.trim().length > 0).join("\n")
    };
  }

  private async runGit(
    projectPath: string,
    sourceId: string | null,
    args: string[],
    options: { allowFailure?: boolean } = {}
  ): Promise<GitProcessResult> {
    if (sourceId === null) {
      throw new Error("Git operations require a Codex source.");
    }

    const client = await this.options.ensureClient(sourceId);
    const response = await runHostProcess(client, {
      command: ["git", ...args],
      cwd: projectPath,
      timeoutMs: 30_000,
      outputBytesCap: 2_000_000
    });

    if (response.exitCode !== 0 && options.allowFailure !== true) {
      throw new Error(createGitErrorMessage(response));
    }

    return response;
  }
}

async function runHostProcess(
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

function readProcessExitedNotification(value: unknown): v2.ProcessExitedNotification | null {
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

function isNotRepositoryResponse(response: GitProcessResult): boolean {
  const output = `${response.stderr}\n${response.stdout}`.toLowerCase();
  return output.includes("not a git repository");
}

function normalizePaths(paths: string[]): string[] {
  const normalizedPaths = paths.map((path) => path.trim()).filter((path) => path.length > 0);

  if (normalizedPaths.length === 0) {
    throw new Error("At least one path is required.");
  }

  return normalizedPaths;
}

function createGitErrorMessage(response: GitProcessResult): string {
  const message = [response.stderr, response.stdout]
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .join("\n");

  return message.length > 0 ? message : `Git exited with code ${response.exitCode}.`;
}
