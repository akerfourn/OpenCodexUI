import { describe, expect, it, vi } from "vitest";
import { parseFileLink, relativeWorkspacePath } from "../src/stores/files/fileLinkTarget";
import { openApplicationLink } from "../src/stores/files/openApplicationLink";
import { AppSettingsStore } from "../src/stores/app/AppSettingsStore";
import type { RootStore } from "../src/stores/RootStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";

describe("source file link targets", () => {
  it("should keep line and column locations without treating drive letters as URLs", () => {
    expect(parseFileLink("src/app.ts:12:4")).toEqual({ path: "src/app.ts", line: 12, column: 4 });
    expect(parseFileLink("C:\\work\\app.ts#L12-L15")).toMatchObject({ path: "C:\\work\\app.ts", line: 12 });
    expect(parseFileLink("file:///work/my%20file.ts#L5")).toMatchObject({ path: "/work/my file.ts", line: 5 });
    expect(parseFileLink("https://example.org/file.ts#L5")).toBeNull();
    expect(parseFileLink("mailto:someone@example.org")).toBeNull();
  });

  it("should enforce workspace boundaries in the source filesystem", () => {
    expect(relativeWorkspacePath("/work/src/../app.ts", "/work")).toBe("app.ts");
    expect(relativeWorkspacePath("../secret", "/work")).toBeNull();
    expect(relativeWorkspacePath("/work-other/app.ts", "/work")).toBeNull();
    expect(relativeWorkspacePath("/work/../../secret", "/work")).toBeNull();
    expect(relativeWorkspacePath("c:\\Work\\src\\app.ts", "C:\\work")).toBe("src/app.ts");
    expect(relativeWorkspacePath("/WORK/app.ts", "/work")).toBeNull();
    expect(relativeWorkspacePath("//server/share/app.ts", "\\\\server\\share")).toBe("app.ts");
  });
});

/** Isolates navigation effects while retaining real source path routing. */
function fixture(mode?: "integrated" | "external") {
  const open = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn().mockResolvedValue({ ok: true, value: { kind: "file" } });
  const root = { settings: { fileOpeningMode: mode }, request } as unknown as RootStore;
  const project = {
    project: { id: "project", sourceId: "wsl" },
    workspacePath: "/work/main",
    workspaces: { workspaces: [
      { id: "main", name: "Principal", path: "/work/main", sourceId: "wsl" },
      { id: "feature", name: "Feature", path: "/work/feature", sourceId: "wsl" }
    ] },
    files: { open }
  } as unknown as ProjectStore;
  return { root, project, open, request };
}

describe("file opening preference", () => {
  it("should preserve document error handling if path inspection cannot reach the backend", async () => {
    const { root, project, open, request } = fixture();
    request.mockRejectedValue(new Error("Disconnected source"));
    await openApplicationLink(root, "app.ts", project);
    expect(open).toHaveBeenCalledOnce();
  });

  it("should discard a pending inspection when its project has been closed", async () => {
    const { root, project, open } = fixture();
    const pending = openApplicationLink(root, "app.ts", project);
    project.files.isDisposed = true;
    await pending;
    expect(open).not.toHaveBeenCalled();
  });

  it("should persist folder handling without changing file handling", async () => {
    const request = vi.fn().mockResolvedValueOnce({ folderOpeningMode: "system" })
      .mockRejectedValueOnce(new Error("Disk full"));
    const settings = new AppSettingsStore({ request });
    await settings.setFolderOpeningMode("system");
    expect(settings.settings.fileOpeningMode).toBe("integrated");
    await expect(settings.setFolderOpeningMode("external")).rejects.toThrow("Disk full");
    expect(settings.settings.folderOpeningMode).toBe("system");
  });

  it("should route actual directories, including the workspace root, through the host folder preference", async () => {
    const { root, project, open, request } = fixture();
    request.mockResolvedValue({ ok: true, value: { kind: "directory" } });
    await openApplicationLink(root, "/work/main", project);
    expect(open).not.toHaveBeenCalled();
    expect(request).toHaveBeenLastCalledWith({ type: "system.openLink", href: "/work/main",
      sourceId: "wsl", projectPath: "/work/main" });
    expect(request.mock.calls[0][0].target.path).toBe("");
  });

  it("should ignore a late folder inspection after another file link was selected", async () => {
    const { root, project, open, request } = fixture();
    let finish!: (value: unknown) => void;
    request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const old = openApplicationLink(root, "old-folder", project);
    await openApplicationLink(root, "latest.ts", project);
    finish({ ok: true, value: { kind: "directory" } });
    await old;
    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.calls[0][0].path).toBe("latest.ts");
    expect(request.mock.calls.every(([value]) => value.type === "workspaceFiles.stat")).toBe(true);
  });

  it("should default to the integrated editor using the originating conversation workspace", async () => {
    const { root, project, open, request } = fixture();
    await openApplicationLink(root, "src/app.ts:12:4", project, "/work/feature", "wsl");
    expect(open).toHaveBeenCalledWith({ sourceId: "wsl", projectId: "project", workspaceId: "feature",
      workspacePath: "/work/feature", path: "src/app.ts" }, "Feature", { line: 12, column: 4 },
    { origin: "link" });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ type: "workspaceFiles.stat" }));
  });

  it("should preserve the source opener and original location in external mode", async () => {
    const { root, project, open, request } = fixture("external");
    await openApplicationLink(root, "src/app.ts:12:4", project, "/work/feature", "wsl");
    expect(open).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith({ type: "system.openLink", href: "src/app.ts:12:4",
      sourceId: "wsl", projectPath: "/work/feature" });
  });

  it("should keep URLs and out-of-workspace files external without reading the wrong source", async () => {
    const { root, project, open, request } = fixture();
    await openApplicationLink(root, "https://example.org", project);
    await openApplicationLink(root, "/outside/app.ts", project);
    await openApplicationLink(root, "app.ts", project, "/work/main", "other-source");
    expect(open).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("should save the preference only after confirmation and keep it on failure", async () => {
    const request = vi.fn().mockResolvedValueOnce({ fileOpeningMode: "external" })
      .mockRejectedValueOnce(new Error("Disk full"));
    const settings = new AppSettingsStore({ request });
    expect(settings.settings.fileOpeningMode).toBe("integrated");
    await settings.setFileOpeningMode("external");
    await expect(settings.setFileOpeningMode("integrated")).rejects.toThrow("Disk full");
    expect(settings.settings.fileOpeningMode).toBe("external");
    expect(request).toHaveBeenNthCalledWith(1, { type: "settings.update", patch: { fileOpeningMode: "external" } });
  });
});
