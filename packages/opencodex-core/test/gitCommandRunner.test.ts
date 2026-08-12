/**
 * Covers source-aware Git command execution and process notification matching.
 */
import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import { describe, expect, it, vi } from "vitest";

import {
  createGitErrorMessage,
  createRunGit,
  type GitProcessResult
} from "../src/backend/git/gitCommandRunner.js";

describe("gitCommandRunner", () => {
  it("should reject a null source before resolving a client", async () => {
    const ensureClient = vi.fn();
    const runGit = createRunGit({ ensureClient });

    await expect(runGit("/workspace/project", null, ["status"])).rejects.toThrow(
      "Git operations require a Codex source."
    );
    expect(ensureClient).not.toHaveBeenCalled();
  });

  it("should run git with the default command, timeout, and output cap", async () => {
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "clean\n", stderr: "" }
    ]);
    const runGit = createRunGit({ ensureClient: async () => client.asCodexClient() });

    const result = await runGit("/workspace/project", "source-1", ["status", "--short"]);

    expect(result).toMatchObject({
      exitCode: 0,
      stdout: "clean\n",
      stdoutCapReached: false,
      stderr: "",
      stderrCapReached: false
    });
    expect(client.spawnParams).toEqual({
      command: ["git", "status", "--short"],
      cwd: "/workspace/project",
      timeoutMs: 30_000,
      outputBytesCap: 2_000_000
    });
  });

  it("should return a non-zero process result when failure is allowed", async () => {
    const client = new FakeCodexClient([
      { exitCode: 2, stdout: "", stderr: "nothing to commit" }
    ]);
    const runGit = createRunGit({ ensureClient: async () => client.asCodexClient() });

    const result = await runGit(
      "/workspace/project",
      "source-1",
      ["commit", "-m", "message"],
      { allowFailure: true, timeoutMs: 1_234, outputBytesCap: 456 }
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toBe("nothing to commit");
    expect(client.spawnParams).toMatchObject({
      timeoutMs: 1_234,
      outputBytesCap: 456
    });
  });

  it("should throw the Git output for an unauthorized failure", async () => {
    const client = new FakeCodexClient([
      { exitCode: 128, stdout: "additional context", stderr: "fatal: repository not found" }
    ]);
    const runGit = createRunGit({ ensureClient: async () => client.asCodexClient() });

    await expect(runGit("/workspace/project", "source-1", ["status"])).rejects.toThrow(
      "fatal: repository not found\nadditional context"
    );
    expect(createGitErrorMessage({
      exitCode: 7,
      stdout: "",
      stdoutCapReached: false,
      stderr: "",
      stderrCapReached: false
    })).toBe("Git exited with code 7.");
  });
});

type FakeProcessResponse = Pick<GitProcessResult, "exitCode" | "stdout" | "stderr">;

/** Simulates the process API used by the Git command runner. */
class FakeCodexClient {
  spawnParams: Omit<v2.ProcessSpawnParams, "processHandle"> | null = null;
  private readonly listeners = new Set<(notification: {
    method: string;
    params?: unknown;
  }) => void>();

  constructor(private readonly responses: FakeProcessResponse[]) {}

  /** Casts this focused fake to the RPC client contract. */
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  /** Registers a notification listener until the returned subscription is disposed. */
  onNotification(listener: (notification: {
    method: string;
    params?: unknown;
  }) => void): { dispose(): void } {
    this.listeners.add(listener);

    return {
      dispose: () => this.listeners.delete(listener)
    };
  }

  /** Records a process spawn and emits a mismatched then matching exit notification. */
  async request<TResponse>(method: string, params: unknown): Promise<TResponse> {
    expect(method).toBe("process/spawn");
    const processParams = params as v2.ProcessSpawnParams;
    const { processHandle, ...spawnParams } = processParams;
    this.spawnParams = spawnParams;

    const response = this.responses.shift();

    if (response === undefined) {
      throw new Error("No fake Git response configured.");
    }

    queueMicrotask(() => {
      const exit = {
        exitCode: response.exitCode,
        stdout: response.stdout,
        stdoutCapReached: false,
        stderr: response.stderr,
        stderrCapReached: false
      };

      for (const listener of this.listeners) {
        listener({
          method: "process/exited",
          params: { processHandle: "another-process", ...exit }
        });
        listener({
          method: "process/exited",
          params: { processHandle, ...exit }
        });
      }
    });

    return {} as TResponse;
  }
}
