import { renderToStaticMarkup } from "react-dom/server";
import { createTheme, ThemeProvider } from "@mui/material";
import { describe, expect, it, vi } from "vitest";
import { FileMarkdownContent, MAX_MARKDOWN_PREVIEW_LENGTH } from "../src/components/files/FileMarkdownContent";
import { FileDocumentViewControlsX } from "../src/components/files/FileDocumentViewControls";
import { FileDocument } from "../src/stores/files/FileDocument";
import { ProjectFilesStore } from "../src/stores/files/ProjectFilesStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, options?: { name?: string }) => options?.name ?? key
}) }));
const target = { sourceId: "wsl", projectId: "project", workspaceId: "main", workspacePath: "/repo", path: "README.md" };

/** Keeps real document navigation while controlling only source reads. */
function fixture() {
  const request = vi.fn().mockResolvedValue({ ok: true, value: {
    content: "# Original", revision: "1", bom: false, eol: "lf", readOnly: false
  } });
  const files = new ProjectFilesStore({} as ProjectStore, { request } as unknown as RootStore);
  return { files, request };
}

describe("Markdown file presentation", () => {
  it("should preserve the buffer and viewer state when switching views and reopening the same file", async () => {
    const { files, request } = fixture();
    await files.open(target, "Main");
    const document = files.active!;
    expect(document.isMarkdownPreview).toBe(true);
    document.setMarkdownPreview(false);
    document.edit("# Unsaved");
    document.viewState = { cursor: 12 };
    document.previewScrollTop = 150;
    document.setMarkdownPreview(true);
    expect(document.content).toBe("# Unsaved");
    expect(document.isDirty).toBe(true);
    document.setMarkdownPreview(false);
    files.showChat();
    await files.open(target, "Main");
    expect(files.active).toBe(document);
    expect(document.isMarkdownPreview).toBe(false);
    expect(document.viewState).toEqual({ cursor: 12 });
    expect(document.previewScrollTop).toBe(150);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("should use source for an explicit position, preview for a heading and diff for Git", async () => {
    const { files } = fixture();
    await files.open(target, "Main", { line: 4 });
    expect(files.active?.isMarkdownPreview).toBe(false);
    expect(files.active?.position).toEqual({ line: 4 });
    await files.open(target, "Main", undefined, { origin: "link", markdownAnchor: "setup" });
    expect(files.active?.isMarkdownPreview).toBe(true);
    expect(files.active?.previewAnchor).toBe("setup");
    await files.open(target, "Main", undefined, { origin: "git",
      gitDiff: { comparison: "workingTree", fileState: "modified" } });
    expect(files.active?.viewMode).toBe("diff");
    expect(files.active?.isMarkdownPreview).toBe(false);
  });

  it("should keep workspaces independent and never offer preview for a non-Markdown language", async () => {
    const { files } = fixture();
    await files.open(target, "Main");
    const main = files.active!;
    main.edit("# Draft");
    main.setMarkdownPreview(false);
    await files.open({ ...target, workspaceId: "other", workspacePath: "/other" }, "Other");
    expect(files.active).not.toBe(main);
    expect(files.active?.isMarkdownPreview).toBe(true);
    expect(main.content).toBe("# Draft");
    files.active!.languageOverride = "typescript";
    expect(files.active?.canPreviewMarkdown).toBe(false);
  });

  it("should retain the previewed buffer when saving fails", async () => {
    const { files, request } = fixture();
    await files.open(target, "Main");
    const document = files.active!;
    document.setMarkdownPreview(false);
    document.edit("# Keep my changes");
    document.setMarkdownPreview(true);
    request.mockRejectedValueOnce(new Error("Source disconnected"));
    expect(await document.save()).toBe(false);
    expect(document.content).toBe("# Keep my changes");
    expect(document.isDirty).toBe(true);
    expect(document.isMarkdownPreview).toBe(true);
    expect(request).toHaveBeenLastCalledWith(expect.objectContaining({
      type: "workspaceFiles.save", target, content: "# Keep my changes"
    }));
  });

  it.each(["light", "dark"] as const)("should render Markdown and source/preview controls in %s theme", mode => {
    const document = new FileDocument("id", "README.md", target, "Main", { request: vi.fn() });
    const markup = renderToStaticMarkup(<ThemeProvider theme={createTheme({ palette: { mode } })}>
      <FileDocumentViewControlsX document={document} />
      <FileMarkdownContent content={"# Setup\n\n## Setup\n\n**Bold**\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n- [x] Done\n\n```js\nconst x = 1;\n```"} />
    </ThemeProvider>);
    expect(markup).toContain("files.viewSource");
    expect(markup).toContain('value="preview" aria-pressed="true"');
    expect(markup).toContain('id="file-markdown-setup"');
    expect(markup).toContain('id="file-markdown-setup-1"');
    expect(markup).toContain("<strong>Bold</strong>");
    expect(markup).toContain("<table>");
    expect(markup).toContain('type="checkbox"');
    expect(markup).toContain("hljs-keyword");
  });

  it("should keep HTML inactive and local images as links rather than host file requests", () => {
    const markup = renderToStaticMarkup(<FileMarkdownContent content={
      '<script>alert(1)</script>\n\n![Diagram](./diagram.png)\n\n[unsafe](javascript:alert(1))\n\n[local](file:///repo/README.md)'
    } />);
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("javascript:");
    expect(markup).not.toContain("<img");
    expect(markup).toContain('href="./diagram.png"');
    expect(markup).toContain('data-markdown-image="true"');
    expect(markup).toContain('href="file:///repo/README.md"');
  });

  it("should avoid parsing oversized documents", () => {
    const markup = renderToStaticMarkup(<FileMarkdownContent content={"# Title\n".repeat(MAX_MARKDOWN_PREVIEW_LENGTH)} />);
    expect(markup).toContain("files.previewTooLarge");
    expect(markup).not.toContain("<h1");
  });
});
