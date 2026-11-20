// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createTheme, ThemeProvider } from "@mui/material";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileTreeEntryX } from "../src/components/files/FileTreeEntry";
import { WorkspaceTreeStore } from "../src/stores/files/WorkspaceTreeStore";
import type { ProjectFilesStore } from "../src/stores/files/ProjectFilesStore";
import type { FileRequestPort } from "../src/stores/files/FileDocument";
import { createFile, createStatus, createProjectGitStatusFixture } from "./ProjectGitStatusStore.fixture";

const translate = (key: string, options?: { count?: number }): string => {
  if (options?.count !== undefined) return `${key}:${options.count}`;
  return key;
};
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate }) }));
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

/** Provides isolated stores and a source port that records only visible-entry checks. */
function fixture() {
  const request = vi.fn().mockResolvedValue({ ok: true, value: [] });
  const tree = new WorkspaceTreeStore(context, { request } as FileRequestPort);
  const git = createProjectGitStatusFixture().gitStore.statusStore;
  const files = { active: null, open: vi.fn() } as unknown as ProjectFilesStore;
  return { request, tree, git, files };
}

describe("explorer Git presentation", () => {
  it("should summarize a collapsed folder and remove its badge reactively when changes disappear", async () => {
    const test = fixture();
    test.git.applyStatus(createStatus({ changedFiles: [createFile("src/one.ts"), createFile("src/two.ts", "added")] }));
    await act(async () => root.render(<FileTreeEntryX entry={{ name: "src", kind: "directory" }}
      tree={test.tree} files={test.files} gitStatusStore={test.git} parentPath="" workspaceName="Feature" depth={0} />));
    const badge = container.querySelector<HTMLElement>('[data-git-directory="true"]')!;
    expect(badge.textContent).toBe("2");
    expect(badge.getAttribute("aria-label")).toContain("files.directoryGit.modified:1");
    expect(badge.getAttribute("aria-label")).toContain("files.directoryGit.added:1");
    expect(container.querySelector('[role="treeitem"]')?.getAttribute("aria-expanded")).toBe("false");
    expect(test.request).not.toHaveBeenCalled();
    await act(async () => test.git.applyStatus(createStatus()));
    expect(container.querySelector("[data-git-state]")).toBeNull();
  });

  it.each(["light", "dark"] as const)("should gray ignored files in %s mode while preserving normal opening", async mode => {
    const test = fixture();
    const theme = createTheme({ palette: { mode } });
    test.tree.gitIgnore.paths.set("generated.txt", true);
    await act(async () => root.render(<ThemeProvider theme={theme}>
      <FileTreeEntryX entry={{ name: "generated.txt", kind: "file" }} tree={test.tree} files={test.files}
        gitStatusStore={test.git} parentPath="" workspaceName="Feature" depth={0} />
    </ThemeProvider>));
    const row = container.querySelector<HTMLElement>('[role="treeitem"]')!;
    expect(row.dataset.gitIgnored).toBe("true");
    expect(row.getAttribute("aria-disabled")).toBe("false");
    expect(getComputedStyle(row).color).toBe(theme.palette.text.secondary);
    expect(container.querySelector('[aria-label*="files.ignoredByGit"]')).not.toBeNull();
    await act(async () => row.click());
    expect(test.files.open).toHaveBeenCalledWith({ ...context, path: "generated.txt" }, "Feature", undefined, { origin: "explorer" });
  });

  it("should reinforce conflicts with an exclamation and keep changed tracked files visible despite ignore patterns", async () => {
    const test = fixture();
    test.git.applyStatus(createStatus({ changedFiles: [createFile("src/conflict.ts", "conflicted"), createFile("src/new.ts", "added")] }));
    test.tree.gitIgnore.paths.set("src", true);
    await act(async () => root.render(<FileTreeEntryX entry={{ name: "src", kind: "directory" }}
      tree={test.tree} files={test.files} gitStatusStore={test.git} parentPath="" workspaceName="Feature" depth={0} />));
    expect(container.querySelector('[data-git-state="conflicted"]')?.textContent).toBe("! 2");
    expect(container.querySelector('[role="treeitem"]')?.getAttribute("data-git-ignored")).toBe("false");
  });

  it("should color file icons and distinguish new-file badges from partial folder counts", async () => {
    const test = fixture();
    test.git.applyStatus(createStatus({ changedFiles: [createFile("new.ts", "added"), createFile("new/", "untracked")] }));
    await act(async () => root.render(<>
      <FileTreeEntryX entry={{ name: "new.ts", kind: "file" }} tree={test.tree} files={test.files}
        gitStatusStore={test.git} parentPath="" workspaceName="Feature" depth={0} />
      <FileTreeEntryX entry={{ name: "new", kind: "directory" }} tree={test.tree} files={test.files}
        gitStatusStore={test.git} parentPath="" workspaceName="Feature" depth={0} />
    </>));
    expect(container.querySelector('[data-git-directory="false"]')?.textContent).toBe("A");
    expect(container.querySelector('[data-git-directory="true"]')?.textContent).toBe("1+");
    expect(getComputedStyle(container.querySelector("[data-file-icon]")!).color).toBe("rgb(26, 127, 55)");
  });

});
