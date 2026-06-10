/**
 * Covers thread conversation source fallback behavior.
 */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexSettings,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import { ThreadTurnCache } from "../src/ThreadTurnCache";
import { ThreadConversationService } from "../src/backend/ThreadConversationService";
import type { ThreadCacheService } from "../src/backend/ThreadCacheService";

describe("ThreadConversationService", () => {
  it("should use the request source when an existing cached thread has no source", async () => {
    const threadTurnCache = new ThreadTurnCache();
    const thread = createThread({ sourceId: null });
    threadTurnCache.getOrCreate(thread);
    const writtenThreads: OpenCodexThread[] = [];
    const client = new FakeCodexClient();
    const events: OpenCodexEvent[] = [];
    const service = new ThreadConversationService({
      backendOptions: { projectPath: "/workspace/project" },
      threadTurnCache,
      threadCacheService: {
        readSnapshot: async () => null,
        writeIndex: async (threads: OpenCodexThread[]) => {
          writtenThreads.push(...threads);
        }
      } as unknown as ThreadCacheService,
      getSettings: () => createSettings(),
      emit: (event) => {
        events.push(event);
      },
      ensureClient: async (sourceId) => {
        expect(sourceId).toBe("source-1");
        return client.asCodexClient();
      },
      resolveSource: async (sourceId) => ({
        id: sourceId ?? "source-1"
      }) as never,
      cacheProject: async () => null,
      readCachedProjects: async () => [],
      handleClientError: () => {}
    });

    const result = await service.startTurn(
      "thread-1",
      "/workspace/project",
      "source-1",
      "Hello",
      [],
      [],
      "gpt-5.5",
      "medium"
    );

    expect(result).toEqual({ threadId: "thread-1", turnId: "turn-1" });
    expect(threadTurnCache.get("thread-1")?.thread.sourceId).toBe("source-1");
    expect(writtenThreads).toMatchObject([{ id: "thread-1", sourceId: "source-1" }]);
    expect(client.startedTurns).toHaveLength(1);
    expect(events.some((event) => event.type === "message.started")).toBe(true);
  });
});

class FakeCodexClient {
  readonly startedTurns: unknown[] = [];

  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  async startTurn(params: unknown): Promise<unknown> {
    this.startedTurns.push(params);
    return { turn: { id: "turn-1" } };
  }
}

function createThread(patch: Partial<OpenCodexThread> = {}): OpenCodexThread {
  return {
    id: "thread-1",
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "",
    model: null,
    reasoningEffort: null,
    projectName: "Project",
    projectPath: "/workspace/project",
    sourceId: "source-1",
    branchName: null,
    updatedAt: null,
    ...patch
  };
}

function createSettings(): OpenCodexSettings {
  return {
    codexCommand: "codex",
    defaultSourceId: "source-1",
    defaultModel: "gpt-5.5",
    defaultReasoningEffort: "medium",
    commitMessageModel: null,
    commitMessageReasoningEffort: null,
    commitMessageLanguage: "en",
    showActivityPanel: true,
    experimentalApi: false,
    allowTurnSteering: true,
    language: "en",
    colorScheme: "system",
    enterKeyBehavior: "newline",
    versioningVocabulary: "simple",
    discordRichPresenceEnabled: true,
    onboardingCompleted: true,
    allowOutdatedCodex: false,
    developerMode: false
  };
}
