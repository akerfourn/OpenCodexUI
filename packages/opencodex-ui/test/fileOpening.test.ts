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
  const request = vi.fn().mockResolvedValue({ ok: true });
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
  it("should default to the integrated editor using the originating conversation workspace", () => {
    const { root, project, open, request } = fixture();
    openApplicationLink(root, "src/app.ts:12:4", project, "/work/feature", "wsl");
    expect(open).toHaveBeenCalledWith({ sourceId: "wsl", projectId: "project", workspaceId: "feature",
      workspacePath: "/work/feature", path: "src/app.ts" }, "Feature", { line: 12, column: 4 });
    expect(request).not.toHaveBeenCalled();
  });

  it("should preserve the source opener and original location in external mode", () => {
    const { root, project, open, request } = fixture("external");
    openApplicationLink(root, "src/app.ts:12:4", project, "/work/feature", "wsl");
    expect(open).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledWith({ type: "system.openLink", href: "src/app.ts:12:4",
      sourceId: "wsl", projectPath: "/work/feature" });
  });

  it("should keep URLs and out-of-workspace files external without reading the wrong source", () => {
    const { root, project, open, request } = fixture();
    openApplicationLink(root, "https://example.org", project);
    openApplicationLink(root, "/outside/app.ts", project);
    openApplicationLink(root, "app.ts", project, "/work/main", "other-source");
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
