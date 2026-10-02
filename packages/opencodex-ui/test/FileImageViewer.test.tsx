import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { OpenCodexImageSnapshot } from "@open-codex-ui/opencodex-protocol";
import { FileDocumentViewX } from "../src/components/files/FileDocumentView";
import { FileDocument } from "../src/stores/files/FileDocument";
import { ProjectFilesStore } from "../src/stores/files/ProjectFilesStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const target = { sourceId: "remote", projectId: "project", workspaceId: "ws",
  workspacePath: "/remote", path: "image.png" };
const image: OpenCodexImageSnapshot = {
  kind: "image", mimeType: "image/png", byteLength: 68, revision: "v1", readOnly: true,
  dataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII="
};

/** Exercises real document state with controlled source reads and source availability. */
async function fixture() {
  const request = vi.fn().mockResolvedValue({ ok: true, value: image });
  const root = { request, sourcesStore: { isSourceReady: () => true, hasLocalAccess: () => false } } as unknown as RootStore;
  const files = new ProjectFilesStore({} as ProjectStore, root);
  await files.open(target, "Remote");
  return { request, root, files, document: files.active! };
}

describe("image file presentation", () => {
  it("should render the image and zoom controls without text editing or host filesystem URLs", async () => {
    const { document, files, root } = await fixture();
    const markup = renderToStaticMarkup(<FileDocumentViewX document={document} files={files} root={root} visible />);
    expect(markup).toContain(`src="${image.dataUrl}"`);
    expect(markup).toContain('alt="image.png"');
    expect(markup).toContain("files.imageFit");
    expect(markup).toContain("files.imageActualSize");
    expect(markup).toContain("files.imageZoomIn");
    expect(markup).not.toContain("fileLanguages.language");
    expect(markup).not.toContain("files.save");
    expect(markup).not.toContain("file://");
    document.edit("cannot edit");
    expect(document.isReadOnly).toBe(true);
    expect(document.isDirty).toBe(false);
    expect(document.content).toBe("");
  });

  it("should retain the image and zoom when returning from chat or reopening the same source file", async () => {
    const { document, files, request } = await fixture();
    document.imageZoom = 2;
    files.showChat();
    await files.open(target, "Remote");
    expect(files.active).toBe(document);
    expect(document.imageSnapshot).toEqual(image);
    expect(document.imageZoom).toBe(2);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({ type: "workspaceFiles.read", target, previewImages: true, previewPdf: true });
  });

  it("should reload changed images without losing zoom and preserve loaded bytes if access disappears", async () => {
    const { document, request } = await fixture();
    document.imageZoom = 0.5;
    const updated = { ...image, revision: "v2", dataUrl: "data:image/png;base64,changed" };
    request.mockResolvedValueOnce({ ok: true, value: false }).mockResolvedValueOnce({ ok: true, value: updated });
    await document.checkExternal();
    expect(request).toHaveBeenNthCalledWith(2, { type: "workspaceFiles.check", target,
      revision: "v1", previewImages: true, previewPdf: true });
    expect(document.imageSnapshot).toEqual(updated);
    expect(document.imageZoom).toBe(0.5);
    request.mockResolvedValueOnce({ ok: false, code: "accessDenied", details: "Access revoked" });
    await document.checkExternal();
    expect(document.error?.code).toBe("accessDenied");
    expect(document.imageSnapshot).toEqual(updated);
  });

  it("should report a binary Git comparison while allowing the current image in File mode", async () => {
    const { document, request } = await fixture();
    document.configureOpen({ origin: "git", gitDiff: { comparison: "workingTree", fileState: "modified" } }, "diff");
    await document.loadGitDiff();
    expect(document.gitDiffSnapshot?.issue).toBe("binary");
    expect(request).toHaveBeenCalledOnce();
    document.setViewMode("file");
    expect(document.imageSnapshot).toEqual(image);
  });

  it("should clear obsolete image or text snapshots when the disk file changes format", async () => {
    const { document, request } = await fixture();
    request.mockResolvedValueOnce({ ok: true, value: {
      content: "now text", revision: "v2", bom: false, eol: "lf", readOnly: false
    } });
    await document.reload();
    expect(document.imageSnapshot).toBeNull();
    expect(document.content).toBe("now text");
    expect(document.isReadOnly).toBe(false);
    request.mockResolvedValueOnce({ ok: true, value: image });
    await document.reload();
    expect(document.snapshot).toBeNull();
    expect(document.content).toBe("");
    expect(document.isDirty).toBe(false);
  });

  it("should ignore an image response that arrives after document disposal", async () => {
    let respond!: (value: unknown) => void;
    const request = vi.fn(() => new Promise(resolve => { respond = resolve; }));
    const document = new FileDocument("late", "image.png", target, "Remote", { request });
    const loading = document.reload();
    document.dispose();
    respond({ ok: true, value: image });
    await loading;
    expect(document.imageSnapshot).toBeNull();
  });
});
