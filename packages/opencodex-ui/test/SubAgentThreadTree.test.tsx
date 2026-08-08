import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => (
      values?.depth === undefined ? key : `${key}:${String(values.depth)}`
    )
  })
}));

import { SubAgentThreadTree } from "../src/components/threads/SubAgentThreadTree";
import { buildSubAgentThreadTree } from "../src/components/threads/subAgentThreadTree";

describe("SubAgentThreadTree", () => {
  it("should render hierarchy depth and agent metadata", () => {
    const root = createThread("root", null, 0);
    const child = createThread("child", "root", 1);
    const grandchild = createThread("grandchild", "child", 2);
    const nodes = buildSubAgentThreadTree(root, [child, grandchild], "source-a");

    const markup = renderToStaticMarkup(
      <SubAgentThreadTree
        rootThread={root}
        nodes={nodes}
        selectedThreadId="grandchild"
        onNavigateRoot={vi.fn()}
        onSelectThread={vi.fn()}
      />
    );

    expect(markup).toContain("data-thread-id=\"child\"");
    expect(markup).toContain("data-thread-depth=\"1\"");
    expect(markup).toContain("data-thread-id=\"grandchild\"");
    expect(markup).toContain("data-thread-depth=\"2\"");
    expect(markup).toContain("/root/grandchild");
    expect(markup).toContain("gpt-5.6-luna");
    expect(markup).toContain("sidebar.subAgentStatus.running");
  });
});

/** Creates thread metadata used by the hierarchy component fixture. */
function createThread(
  id: string,
  parentThreadId: string | null,
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
    sourceId: "source-a",
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
    canAcceptDirectInput: false,
    status: "running"
  };
}
