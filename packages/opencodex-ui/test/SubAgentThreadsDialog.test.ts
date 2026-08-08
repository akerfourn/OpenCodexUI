import { describe, expect, it } from "vitest";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import {
  resolveInitialSubAgentThreadId
} from "../src/components/threads/SubAgentThreadsDialog";

describe("SubAgentThreadsDialog selection", () => {
  it("should preserve a requested descendant after the hierarchy loads", () => {
    const threads = [createThread("child-1"), createThread("child-2")];

    expect(resolveInitialSubAgentThreadId("child-2", threads, "child-1"))
      .toBe("child-2");
  });

  it("should fall back to the first descendant when the target is unavailable", () => {
    const threads = [createThread("child-1")];

    expect(resolveInitialSubAgentThreadId("missing", threads, "child-1"))
      .toBe("child-1");
  });
});

/** Creates the minimum normalized thread metadata needed by selection tests. */
function createThread(id: string): OpenCodexThread {
  return {
    id,
    sessionId: null,
    parentThreadId: "parent-1",
    codexTitle: id,
    customTitle: null,
    title: id,
    preview: "",
    model: null,
    reasoningEffort: null,
    projectName: "project-1",
    projectPath: "/workspace/project-1",
    sourceId: "source-1",
    branchName: null,
    updatedAt: null,
    isArchived: false,
    threadSource: null,
    agentNickname: null,
    agentRole: null,
    subAgentSource: null,
    canAcceptDirectInput: null
  };
}
