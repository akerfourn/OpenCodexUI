import { describe, expect, it } from "vitest";
import type { OpenCodexGitFile, OpenCodexGitFileState } from "@open-codex-ui/opencodex-protocol";
import { createGitDirectoryStatusIndex } from "../src/stores/project/git/gitDirectoryStatusIndex";
import { createGitFileStatusIndex } from "../src/stores/project/git/gitFileStatusIndex";
import { createStatus } from "./ProjectGitStatusStore.fixture";

/** Creates one normalized Git path without involving filesystem scans. */
function file(path: string, status: OpenCodexGitFileState, originalPath: string | null = null): OpenCodexGitFile {
  return { path, status, originalPath, stagedStatus: null, unstagedStatus: status };
}

/** Indexes unique file snapshots before aggregating their ancestors. */
function summaries(files: OpenCodexGitFile[]) {
  return createGitDirectoryStatusIndex(new Map(files.map(item => [item.path, item])));
}

describe("Git directory decorations", () => {
  it("should propagate to every collapsed ancestor without matching similarly named siblings", () => {
    const index = summaries([file("src/ui/widget.ts", "modified"), file("src/new.ts", "added"), file("src-other/a", "added")]);
    expect(index.get("src")).toMatchObject({ count: 2, status: "modified", counts: { modified: 1, added: 1 } });
    expect(index.get("src/ui")).toMatchObject({ count: 1, status: "modified" });
    expect(index.get("src-other")).toMatchObject({ count: 1, status: "added" });
    expect(index.has("")).toBe(false);
  });

  it("should count a staged and unstaged path only once and prioritize conflicts over mixed changes", () => {
    const same = file("src/a", "modified");
    const index = createGitDirectoryStatusIndex(createGitFileStatusIndex(createStatus({
      stagedFiles: [same], changedFiles: [same, file("src/b", "added"), file("src/c", "conflicted")]
    })));
    expect(index.get("src")).toMatchObject({ count: 3, status: "conflicted",
      counts: { modified: 1, added: 1, conflicted: 1 } });
  });

  it("should color new folders without claiming an exact file count when Git groups untracked content", () => {
    const index = summaries([file("new/nested/", "untracked"), file("new/known", "untracked")]);
    expect(index.get("new")).toMatchObject({ count: 2, status: "added", untrackedDirectories: 1, counts: { untracked: 1 } });
    expect(index.get("new/nested")).toMatchObject({ count: 1, untrackedDirectories: 1 });
  });

  it("should decorate both ends of a rename while counting a shared ancestor only once", () => {
    const index = summaries([file("src/new/a", "renamed", "src/old/a"), file("copy/b", "copied", "unchanged/b")]);
    for (const path of ["src", "src/new", "src/old"]) expect(index.get(path)).toMatchObject({ count: 1, status: "modified" });
    expect(index.has("unchanged")).toBe(false);
  });
});
