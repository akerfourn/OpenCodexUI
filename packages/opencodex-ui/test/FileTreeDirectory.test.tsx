// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexFileEntry } from "@open-codex-ui/opencodex-protocol";
import { FileTreeDirectoryX } from "../src/components/files/FileTreeDirectory";
import { WorkspaceTreeStore } from "../src/stores/files/WorkspaceTreeStore";
import type { ProjectFilesStore } from "../src/stores/files/ProjectFilesStore";
import type { ProjectGitStatusStore } from "../src/stores/project/git/ProjectGitStatusStore";
import type { FileRequestPort } from "../src/stores/files/FileDocument";
import { createStatus } from "./ProjectGitStatusStore.fixture";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
// Row behavior has its own tests; static leaves keep the pagination and request test small.
vi.mock("../src/components/files/FileTreeEntry", () => ({
  FileTreeEntryX: function FileTreeEntryX({ entry }: { entry: OpenCodexFileEntry }) {
    return <span data-entry>{entry.name}</span>;
  }
}));
const context = { sourceId: "wsl", projectId: "project", workspaceId: "secondary", workspacePath: "/worktree" };
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

/** Mounts a directory with plain static leaf fixtures and a repository snapshot. */
async function render(tree: WorkspaceTreeStore, path: string): Promise<void> {
  const git = { status: createStatus() } as ProjectGitStatusStore;
  await act(async () => root.render(<FileTreeDirectoryX tree={tree} files={{} as ProjectFilesStore}
    gitStatusStore={git} path={path} workspaceName="Feature" />));
}

describe("lazy file directory ignore checks", () => {
  it("should check only rendered entries and request the next batch only after pagination", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: [] });
    const tree = new WorkspaceTreeStore(context, { request } as FileRequestPort);
    const entries: OpenCodexFileEntry[] = Array.from({ length: 201 }, (_, index) => ({ name: `file${index}`, kind: "file" }));
    tree.directories.set("", { entries, loading: false, loaded: true, error: null });
    await render(tree, "");
    expect(container.querySelectorAll("[data-entry]")).toHaveLength(200);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][0].paths).toHaveLength(200);
    await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "files.showMore")!.click());
    expect(container.querySelectorAll("[data-entry]")).toHaveLength(201);
    expect(request.mock.calls[1][0].paths).toEqual(["file200"]);
  });

  it("should skip linked directories and every level inside a nested repository", async () => {
    const request = vi.fn();
    const tree = new WorkspaceTreeStore(context, { request } as FileRequestPort);
    tree.directories.set("", { entries: [{ name: "alias", kind: "directory", linkTarget: "../elsewhere" }],
      loading: false, loaded: true, error: null });
    tree.directories.set("alias", { entries: [{ name: "data", kind: "file" }], loading: false, loaded: true, error: null });
    tree.directories.set("nested", { entries: [{ name: ".git", kind: "file" }, { name: "deep", kind: "directory" }],
      loading: false, loaded: true, error: null });
    tree.directories.set("nested/deep", { entries: [{ name: "data", kind: "file" }], loading: false, loaded: true, error: null });
    for (const path of ["alias", "nested", "nested/deep"]) await render(tree, path);
    expect(request).not.toHaveBeenCalled();
  });
});
