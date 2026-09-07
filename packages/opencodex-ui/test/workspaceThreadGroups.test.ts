import { describe, expect, it } from "vitest";
import type { OpenCodexProjectWorkspace, OpenCodexThread } from "@open-codex-ui/opencodex-protocol";
import { groupWorkspaceThreads, workspaceLabel } from "../src/stores/project/threads/workspaceThreadGroups";

const primary: OpenCodexProjectWorkspace = { id: "A", projectId: "project", sourceId: "source",
  path: "/A", isPrimary: true, managed: false, removedAt: null };
const secondary: OpenCodexProjectWorkspace = { ...primary, id: "B", path: "/B", name: "Feature", isPrimary: false };
/** Minimal metadata required for grouping; no runtime behavior is mocked. */
function thread(id: string, projectPath: string, sourceId = "source"): OpenCodexThread {
  return { id, projectPath, sourceId } as OpenCodexThread;
}

describe("workspace chat groups", () => {
  it("should keep empty workspaces and preserve the conversation order within each group", () => {
    const groups = groupWorkspaceThreads([primary, secondary], [thread("recent", "/B"), thread("older", "/B")], "source");
    expect(groups.map((group) => [group.id, group.threads.map((item) => item.id)]))
      .toEqual([["A", []], ["B", ["recent", "older"]]]);
  });

  it("should never merge another source or lose unmatched cached conversations", () => {
    const groups = groupWorkspaceThreads([primary], [thread("foreign", "/A", "other"), thread("legacy", "/missing")], "source");
    expect(groups[0].threads).toEqual([]);
    expect(groups.slice(1).flatMap((group) => group.threads.map((item) => item.id))).toEqual(["foreign", "legacy"]);
  });

  it("should move a conversation between groups only when its confirmed context changes", () => {
    const before = groupWorkspaceThreads([primary, secondary], [thread("chat", "/A")], "source");
    const after = groupWorkspaceThreads([primary, secondary], [thread("chat", "/B")], "source");
    expect(before[0].threads[0].id).toBe("chat");
    expect(after[0].threads).toEqual([]);
    expect(after[1].threads[0].id).toBe("chat");
  });

  it("should use fixed primary labels, custom names and source-native legacy names", () => {
    expect(workspaceLabel({ ...primary, name: "Ignored" }, "Principal")).toBe("Principal");
    expect(workspaceLabel(secondary, "Principal")).toBe("Feature");
    expect(workspaceLabel({ ...secondary, name: null, path: "C:\\repo\\topic" }, "Principal")).toBe("topic");
  });
});
