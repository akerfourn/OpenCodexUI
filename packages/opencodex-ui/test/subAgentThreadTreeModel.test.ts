import { describe, expect, it } from "vitest";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import {
  buildSubAgentBreadcrumbs,
  buildSubAgentThreadTree
} from "../src/components/threads/subAgentThreadTreeModel";

describe("sub-agent thread tree", () => {
  it("should preserve nested descendants instead of flattening them", () => {
    const root = createThread("root", null, "source-a", 0);
    const child = createThread("child", "root", "source-a", 1);
    const sibling = createThread("sibling", "root", "source-a", 1);
    const grandchild = createThread("grandchild", "child", "source-a", 2);

    const tree = buildSubAgentThreadTree(
      root,
      [child, sibling, grandchild],
      "source-a"
    );

    expect(tree.map((node) => node.thread.id)).toEqual(["child", "sibling"]);
    expect(tree[0]?.children.map((node) => node.thread.id)).toEqual(["grandchild"]);
    expect(tree[1]?.children).toEqual([]);
  });

  it("should keep a descendant readable when its direct parent is absent", () => {
    const root = createThread("root", null, "source-a", 0);
    const orphan = createThread("orphan", "missing-parent", "source-a", 3);

    const tree = buildSubAgentThreadTree(root, [orphan], "source-a");

    expect(tree).toMatchObject([{
      thread: { id: "orphan" },
      isOrphan: true,
      missingParentThreadId: "missing-parent"
    }]);
  });

  it("should isolate duplicate thread ids across source scopes", () => {
    const root = createThread("root", null, "source-a", 0);
    const sourceAChild = createThread("shared", "root", "source-a", 1);
    const sourceBChild = createThread("shared", "root", "source-b", 1);

    const tree = buildSubAgentThreadTree(
      root,
      [sourceAChild, sourceBChild],
      "source-a"
    );

    expect(tree).toHaveLength(1);
    expect(tree[0]?.thread).toBe(sourceAChild);
    expect(tree[0]?.key).toBe("source:source-a:shared");
  });

  it("should preserve orphaned cache nodes in the null source scope", () => {
    const root = createThread("root", null, null, 0);
    const child = createThread("child", "root", null, 1);

    const tree = buildSubAgentThreadTree(root, [child], null);

    expect(tree).toMatchObject([{ key: "orphan:child", thread: { id: "child" } }]);
  });

  it("should reconstruct known and missing parent breadcrumbs", () => {
    const root = createThread("root", null, "source-a", 0);
    const child = createThread("child", "root", "source-a", 1);
    const grandchild = createThread("grandchild", "child", "source-a", 2);
    const orphan = createThread("orphan", "missing-parent", "source-a", 3);

    expect(buildSubAgentBreadcrumbs(
      root,
      [child, grandchild],
      grandchild,
      "source-a"
    ).map((entry) => entry.threadId)).toEqual(["root", "child", "grandchild"]);
    expect(buildSubAgentBreadcrumbs(
      root,
      [orphan],
      orphan,
      "source-a"
    )).toMatchObject([
      { threadId: "missing-parent", isMissing: true },
      { threadId: "orphan", isMissing: false }
    ]);
  });
});

/** Creates source-aware thread metadata for hierarchy tests. */
function createThread(
  id: string,
  parentThreadId: string | null,
  sourceId: string | null,
  depth: number
): OpenCodexThread {
  return {
    id,
    sessionId: null,
    parentThreadId,
    codexTitle: id,
    customTitle: null,
    title: id,
    preview: "",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    projectName: "project",
    projectPath: "/workspace/project",
    sourceId,
    branchName: null,
    updatedAt: null,
    isArchived: false,
    threadSource: null,
    agentNickname: id,
    agentRole: "worker",
    subAgentSource: parentThreadId === null ? null : {
      kind: "threadSpawn",
      parentThreadId,
      depth,
      agentPath: `/root/${id}`,
      agentNickname: id,
      agentRole: "worker",
      label: null
    },
    canAcceptDirectInput: parentThreadId === null,
    status: "idle"
  };
}
