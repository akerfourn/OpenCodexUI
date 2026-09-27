import { describe, expect, it, vi } from "vitest";
import { openMarkdownLink, resolveMarkdownLink } from "../src/stores/files/markdownLinks";
import { FileDocument } from "../src/stores/files/FileDocument";
import type { ProjectFilesStore } from "../src/stores/files/ProjectFilesStore";

const target = { sourceId: "wsl", projectId: "project", workspaceId: "feature",
  workspacePath: "/repo/feature", path: "docs/README.md" };

describe("Markdown links", () => {
  it("should resolve relative paths, encoded names, headings and source locations", () => {
    expect(resolveMarkdownLink("../guide%20one.md#setup", target)).toEqual({ kind: "file",
      target: { ...target, path: "guide one.md" }, anchor: "setup", position: undefined });
    expect(resolveMarkdownLink("./code.ts#L12C3", target)).toMatchObject({ kind: "file",
      target: { ...target, path: "docs/code.ts" }, position: { line: 12, column: 3 } });
    expect(resolveMarkdownLink("guide.md", { ...target, path: "README.md" })).toMatchObject({
      target: { ...target, path: "guide.md" }
    });
    expect(resolveMarkdownLink("#début", target)).toEqual({ kind: "anchor", anchor: "début" });
  });

  it("should retain native source path semantics and reject escapes or executable protocols", () => {
    const windows = { ...target, workspacePath: "C:\\repo" };
    expect(resolveMarkdownLink("file:///C:/repo/guide.md", windows)).toMatchObject({
      target: { ...windows, path: "guide.md" }
    });
    expect(() => resolveMarkdownLink("../../private.md", target)).toThrow("outside the document workspace");
    expect(() => resolveMarkdownLink("%2Fetc/passwd", target)).toThrow("outside the document workspace");
    expect(() => resolveMarkdownLink("javascript:alert(1)", target)).toThrow("Unsupported link protocol");
    expect(() => resolveMarkdownLink("guide.md", null)).toThrow("no filesystem context");
  });

  it("should open files in the document workspace and route web links and local images explicitly", async () => {
    const request = vi.fn();
    const open = vi.fn();
    const document = new FileDocument("id", "README.md", target, "Feature", { request });
    const files = { open } as unknown as ProjectFilesStore;
    await openMarkdownLink("guide.md#setup", document, files, { request });
    expect(open).toHaveBeenCalledWith({ ...target, path: "docs/guide.md" }, "Feature", undefined,
      { origin: "link", markdownAnchor: "setup" });
    await openMarkdownLink("https://example.org", document, files, { request });
    expect(request).toHaveBeenLastCalledWith({ type: "system.openLink", href: "https://example.org",
      projectPath: target.workspacePath, sourceId: target.sourceId });
    await openMarkdownLink("diagram.png", document, files, { request }, true);
    expect(request).toHaveBeenLastCalledWith({ type: "system.openLink", href: "docs/diagram.png",
      projectPath: target.workspacePath, sourceId: target.sourceId, workspaceId: target.workspaceId });
    await openMarkdownLink("#setup", document, files, { request });
    expect(document.previewAnchor).toBe("setup");
    await openMarkdownLink("#L8", document, files, { request });
    expect(document.isMarkdownPreview).toBe(false);
    expect(document.position).toEqual({ line: 8, column: 1 });
  });
});
