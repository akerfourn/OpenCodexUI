import { isObservable, observable } from "mobx";
import { describe, expect, it, vi } from "vitest";
import { createMarkdownImageLoader } from "../src/stores/files/markdownImageLoader";
import type { FileRequestPort } from "../src/stores/files/FileDocument";

const target = {
  sourceId: "wsl", projectId: "project", workspaceId: "feature",
  workspacePath: "/repo/feature", path: "docs/README.md"
};
const dataUrl = "data:image/png;base64,aGVsbG8=";

describe("Markdown image reads", () => {
  it("should resolve images relative to the owning document and send a plain workspace request", async () => {
    const documentTarget = observable({ ...target });
    const request = vi.fn().mockResolvedValue({ ok: true, value: { kind: "image", dataUrl } });
    const loadImage = createMarkdownImageLoader({ request } as FileRequestPort, documentTarget);
    documentTarget.sourceId = "other";
    documentTarget.path = "moved/README.md";

    expect(await loadImage("../assets/génération #1%20.png")).toBe(dataUrl);

    expect(request).toHaveBeenCalledWith({ type: "workspaceFiles.read", previewImages: true,
      target: { ...target, path: "assets/génération #1%20.png" } });
    expect(isObservable(request.mock.calls[0][0].target)).toBe(false);
    await loadImage("../assets/génération #1%20.png");
    expect(request).toHaveBeenCalledOnce();
  });

  it("should retain Windows source paths without interpreting them on the host", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: { kind: "image", dataUrl } });
    const windows = { ...target, sourceId: "windows", workspacePath: "C:\\repo\\feature" };
    const loadImage = createMarkdownImageLoader({ request } as FileRequestPort, windows);

    await loadImage("C:/repo/feature/assets/image.png");

    expect(request).toHaveBeenCalledWith({ type: "workspaceFiles.read", previewImages: true,
      target: { ...windows, path: "assets/image.png" } });
  });

  it("should reject paths outside the workspace and documents without a filesystem context", async () => {
    const request = vi.fn();
    const port = { request } as FileRequestPort;
    const loadImage = createMarkdownImageLoader(port, target);

    await expect(loadImage("../../private.png")).rejects.toThrow("outside the document workspace");
    await expect(loadImage("/outside/private.png")).rejects.toThrow("outside the document workspace");
    await expect(createMarkdownImageLoader(port, null)("image.png"))
      .rejects.toThrow("no filesystem context");
    expect(request).not.toHaveBeenCalled();
  });

  it("should preserve permission and size errors and retry failed reads", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce({ ok: false, code: "accessDenied", details: "External link access denied" })
      .mockResolvedValueOnce({ ok: false, code: "tooLarge", details: "Maximum supported image size: 10 MiB." })
      .mockResolvedValue({ ok: true, value: { kind: "image", dataUrl } });
    const loadImage = createMarkdownImageLoader({ request } as FileRequestPort, target);

    await expect(loadImage("image.png")).rejects.toThrow("External link access denied");
    await expect(loadImage("image.png")).rejects.toThrow("10 MiB");
    await expect(loadImage("image.png")).resolves.toBe(dataUrl);
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("should reject text snapshots rather than treating arbitrary source contents as image bytes", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: { content: "private text" } });
    const loadImage = createMarkdownImageLoader({ request } as FileRequestPort, target);

    await expect(loadImage("image.png")).rejects.toThrow("Only image files can be previewed");
  });
});
