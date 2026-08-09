import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it, vi } from "vitest";

import {
  GitRuntimeHandler,
  type GitRuntimeHandlerOptions
} from "../src/backend/GitRuntimeHandler";

describe("GitRuntimeHandler", () => {
  it("should delegate Git status to the source client", async () => {
    const client = new FakeCodexClient([
      {
        exitCode: 128,
        stdout: "",
        stderr: "not a repository"
      }
    ]);
    const handler = createHandler({
      ensureClient: async () => client.asCodexClient()
    });

    const status = await handler.readGitStatus("/workspace/project", "source-1");

    expect(status.isRepository).toBe(false);
    expect(client.commands).toEqual([
      ["git", "rev-parse", "--is-inside-work-tree"]
    ]);
  });

  it("should preserve prompt files at the configured paths", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "opencodex-git-handler-"));
    const defaultPromptPath = path.join(temporaryDirectory, "default.md");
    const generationPromptPath = path.join(temporaryDirectory, "generation.md");

    try {
      await writeFile(defaultPromptPath, "Default commit prompt", "utf8");
      await writeFile(generationPromptPath, "Generation template", "utf8");
      const handler = createHandler({
        userDataPath: path.join(temporaryDirectory, "user-data"),
        defaultPromptPath,
        generationPromptPath
      });

      await expect(handler.readCommitPrompt()).resolves.toEqual({
        prompt: "Default commit prompt",
        defaultPrompt: "Default commit prompt",
        isDefault: true
      });
      await expect(readFile(
        path.join(temporaryDirectory, "user-data", "prompt-commit.user.md"),
        "utf8"
      )).resolves.toBe("Default commit prompt");

      await expect(handler.updateCommitPrompt("Use imperative mood")).resolves.toEqual({
        prompt: "Use imperative mood",
        defaultPrompt: "Default commit prompt",
        isDefault: false
      });
      await expect(handler.resetCommitPrompt()).resolves.toEqual({
        prompt: "Default commit prompt",
        defaultPrompt: "Default commit prompt",
        isDefault: true
      });
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });

  it("should release ignored notifications and finish usage tracking after generation failure", async () => {
    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "opencodex-git-handler-"));
    const defaultPromptPath = path.join(temporaryDirectory, "default.md");
    const generationPromptPath = path.join(temporaryDirectory, "generation.md");
    const client = new FakeCodexClient([
      { exitCode: 0, stdout: "stat\n", stderr: "" },
      { exitCode: 0, stdout: "name-status\n", stderr: "" },
      { exitCode: 0, stdout: "diff\n", stderr: "" }
    ]);
    const started = vi.fn();
    const finished = vi.fn();
    const ignored = vi.fn();
    const released = vi.fn();

    client.startThread = async () => ({ thread: { id: "thread-1" } });
    client.startTurn = async () => {
      throw new Error("generation failed");
    };

    try {
      await writeFile(defaultPromptPath, "Default commit prompt", "utf8");
      await writeFile(generationPromptPath, "Generation template", "utf8");
      const handler = createHandler({
        userDataPath: path.join(temporaryDirectory, "user-data"),
        defaultPromptPath,
        generationPromptPath,
        ensureClient: async () => client.asCodexClient(),
        ignoreThreadNotifications: ignored,
        releaseThreadNotifications: released,
        onGenerationStarted: started,
        onGenerationFinished: finished
      });

      await expect(handler.generateGitCommitMessage(
        "/workspace/project",
        "source-1",
        "",
        "gpt-5",
        null,
        "en"
      )).rejects.toThrow("generation failed");

      expect(started).toHaveBeenCalledWith("source-1", "gpt-5");
      expect(ignored).toHaveBeenCalledWith("thread-1");
      expect(released).toHaveBeenCalledWith("thread-1");
      expect(finished).toHaveBeenCalledWith("source-1", "gpt-5");
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});

/** Creates a handler with a narrow deterministic default dependency set. */
function createHandler(overrides: Partial<GitRuntimeHandlerOptions> = {}): GitRuntimeHandler {
  return new GitRuntimeHandler({
    getSettings: () => ({
      commitMessageModel: null,
      commitMessageReasoningEffort: null
    } as OpenCodexSettings),
    ensureClient: async () => {
      throw new Error("No fake Codex client configured.");
    },
    ignoreThreadNotifications: () => {},
    releaseThreadNotifications: () => {},
    ...overrides
  });
}

type FakeProcessResponse = Pick<
  v2.ProcessExitedNotification,
  "exitCode" | "stdout" | "stderr"
>;

type FakeNotificationListener = (notification: {
  method: string;
  params: v2.ProcessExitedNotification;
}) => void;

/** Provides only the app-server calls needed by GitService in these tests. */
class FakeCodexClient {
  readonly commands: string[][] = [];
  private readonly listeners = new Set<FakeNotificationListener>();

  constructor(private readonly responses: FakeProcessResponse[]) {}

  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  onNotification(listener: FakeNotificationListener): { dispose(): void } {
    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      }
    };
  }

  async request<TResponse>(method: string, params: unknown): Promise<TResponse> {
    expect(method).toBe("process/spawn");
    const processParams = params as v2.ProcessSpawnParams;
    this.commands.push([...processParams.command]);
    const response = this.responses.shift();

    if (response === undefined) {
      throw new Error("No fake Git response configured.");
    }

    queueMicrotask(() => {
      const notification = {
        method: "process/exited",
        params: {
          processHandle: processParams.processHandle,
          exitCode: response.exitCode,
          stdout: response.stdout,
          stdoutCapReached: false,
          stderr: response.stderr,
          stderrCapReached: false
        }
      };

      for (const listener of this.listeners) {
        listener(notification);
      }
    });

    return {} as TResponse;
  }

  async startThread(): Promise<unknown> {
    throw new Error("No fake thread response configured.");
  }

  async startTurn(): Promise<unknown> {
    throw new Error("No fake turn response configured.");
  }
}
