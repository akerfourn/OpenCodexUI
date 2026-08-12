import { vi } from "vitest";

import type {
  OpenCodexActivity,
  OpenCodexThread,
  OpenCodexThreadTokenUsage,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import { ChatStore } from "../../src/stores/ChatStore";
import type { ProjectStore } from "../../src/stores/ProjectStore";
import type { RootStore } from "../../src/stores/RootStore";

/** Creates a chat store with deterministic project and root collaborators. */
export function createChatStore(threadPatch: Partial<OpenCodexThread>): ChatStore {
  return new ChatStore(
    createThread(threadPatch),
    createProjectStore(),
    createRootStore()
  );
}

/** Creates a thread fixture with optional field overrides. */
export function createThread(patch: Partial<OpenCodexThread>): OpenCodexThread {
  return {
    id: "thread-1",
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "Preview",
    model: null,
    reasoningEffort: null,
    projectName: "project",
    projectPath: "/tmp/project",
    sourceId: "source-1",
    branchName: "main",
    updatedAt: null,
    ...patch
  };
}

/** Creates an empty turn fixture. */
export function createTurn(id: string, status: OpenCodexTurn["status"]): OpenCodexTurn {
  return {
    id,
    threadId: "thread-1",
    status,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    items: []
  };
}

/** Creates a token-usage snapshot for one turn. */
export function createTokenUsage(turnId: string): OpenCodexThreadTokenUsage {
  return {
    threadId: "thread-1",
    turnId,
    total: {
      totalTokens: 120,
      inputTokens: 80,
      cachedInputTokens: 20,
      outputTokens: 30,
      reasoningOutputTokens: 10
    },
    last: {
      totalTokens: 120,
      inputTokens: 80,
      cachedInputTokens: 20,
      outputTokens: 30,
      reasoningOutputTokens: 10
    },
    contextWindowTokens: 120,
    modelContextWindow: 1_000,
    usedPercent: 12
  };
}

/** Waits for the promise callbacks scheduled by store actions. */
export async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Creates the minimal project-store collaborator used by chat tests. */
export function createProjectStore(): ProjectStore {
  const threadListState = {
    threads: [createThread({})]
  };

  return {
    project: {
      id: "project-1",
      sourceId: "source-1"
    },
    projectPath: "/tmp/project",
    isOrphan: false,
    resolveThreadSourceId: vi.fn((thread: OpenCodexThread) => (
      thread.sourceId ?? "source-1"
    )),
    ensureThreadSource: vi.fn((thread: OpenCodexThread) => {
      const sourceId = thread.sourceId ?? "source-1";

      if (sourceId === thread.sourceId) {
        return thread;
      }

      return {
        ...thread,
        sourceId
      };
    }),
    registerChatRoute: vi.fn(),
    upsertThread: vi.fn((thread: OpenCodexThread) => thread),
    threadListStore: threadListState,
    renameThread: vi.fn((threadId: string, name: string) => {
      threadListState.threads = threadListState.threads.map((thread) => (
        thread.id === threadId
          ? { ...thread, customTitle: name, title: name }
          : thread
      ));
    }),
    openThread: vi.fn()
  } as ProjectStore;
}

/** Creates the minimal root-store collaborator used by chat tests. */
export function createRootStore(): RootStore {
  return {
    appStore: {
      models: [
        {
          id: "gpt-5.5",
          model: "gpt-5.5",
          displayName: "GPT-5.5",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "" },
            { reasoningEffort: "medium", description: "" },
            { reasoningEffort: "high", description: "" },
            { reasoningEffort: "xhigh", description: "" }
          ],
          defaultReasoningEffort: "medium",
          serviceTiers: []
        },
        {
          id: "gpt-5.4-mini",
          model: "gpt-5.4-mini",
          displayName: "GPT-5.4 Mini",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "" },
            { reasoningEffort: "medium", description: "" },
            { reasoningEffort: "high", description: "" }
          ],
          defaultReasoningEffort: "medium",
          serviceTiers: []
        }
      ],
      selectedModel: "gpt-5.4",
      settings: {
        defaultModel: null,
        defaultReasoningEffort: "medium"
      },
      errorMessage: null,
      getReasoningEffortOptions: vi.fn(() => []),
      resolveReasoningEffort: vi.fn((_model: string | null, effort: string) => effort)
    },
    navigationStore: {
      activeProjectStore: null
    },
    request: vi.fn(() => Promise.resolve({ ok: true }))
  } as RootStore;
}

/** Creates one replace-only live plan snapshot. */
export function createPlanActivity(
  content: string,
  steps: NonNullable<OpenCodexActivity["plan"]>["steps"]
): OpenCodexActivity {
  return {
    id: "plan-turn-1",
    threadId: "thread-1",
    kind: "plan",
    title: "turn-1",
    content,
    status: "running",
    plan: {
      explanation: null,
      steps
    }
  };
}

/** Creates one command activity update. */
export function createCommandActivity(
  content: string,
  status: OpenCodexActivity["status"],
  details: Record<string, unknown>
): OpenCodexActivity {
  return {
    id: "command-1",
    threadId: "thread-1",
    kind: "commandExecution",
    title: "turn-1",
    content,
    status,
    details: JSON.stringify(details)
  };
}
