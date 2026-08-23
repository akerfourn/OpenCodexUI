/** Covers structural hierarchy filters independently from Codex and cache I/O. */
import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import {
  filterDescendantThreads,
  filterMainThreads
} from "../src/backend/threadHierarchy";

describe("thread hierarchy helpers", () => {
  it("should follow structured parents while preserving order and rejecting cycles", () => {
    const fallbackChild = createThread({
      id: "fallback-child",
      subAgentSource: createSubAgentSource("root-thread", 1)
    });
    const nestedChild = createThread({
      id: "nested-child",
      parentThreadId: "fallback-child"
    });
    const cycleA = createThread({ id: "cycle-a", parentThreadId: "cycle-b" });
    const cycleB = createThread({ id: "cycle-b", parentThreadId: "cycle-a" });
    const unrelated = createThread({ id: "unrelated", parentThreadId: "other-root" });

    const descendants = filterDescendantThreads("root-thread", [
      nestedChild,
      cycleA,
      fallbackChild,
      unrelated,
      cycleB
    ]);

    expect(descendants.map((thread) => thread.id)).toEqual([
      "nested-child",
      "fallback-child"
    ]);
  });

  it("should keep top-level threads and exclude parent or sub-agent sources", () => {
    const mainThread = createThread({ id: "main", threadSource: "appServer" });
    const childThread = createThread({ id: "child", parentThreadId: "main" });
    const sourceChild = createThread({
      id: "source-child",
      threadSource: "subAgentReview"
    });
    const unknownThread = createThread({ id: "unknown", threadSource: "futureSource" });

    expect(filterMainThreads([
      mainThread,
      childThread,
      sourceChild,
      unknownThread
    ]).map((thread) => thread.id)).toEqual(["main", "unknown"]);
  });
});

/** Creates complete protocol metadata for a pure hierarchy test. */
function createThread(patch: Partial<OpenCodexThread> = {}): OpenCodexThread {
  return {
    id: "thread-1",
    sessionId: null,
    parentThreadId: null,
    codexTitle: "Thread",
    customTitle: null,
    title: "Thread",
    preview: "",
    model: null,
    reasoningEffort: null,
    projectName: "project",
    projectPath: "/workspace/project",
    sourceId: "source-1",
    branchName: null,
    updatedAt: null,
    isArchived: false,
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    subAgentSource: null,
    canAcceptDirectInput: null,
    ...patch
  };
}

/** Creates structured ancestry metadata for a fallback-parent case. */
function createSubAgentSource(
  parentThreadId: string,
  depth: number
): NonNullable<OpenCodexThread["subAgentSource"]> {
  return {
    kind: "threadSpawn",
    parentThreadId,
    depth,
    agentPath: "/root/agent",
    agentNickname: "Agent",
    agentRole: "worker",
    label: null
  };
}
