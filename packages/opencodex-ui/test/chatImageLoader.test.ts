import { describe, expect, it, vi } from "vitest";
import type { FileRequestPort } from "../src/stores/files/FileDocument";
import { createChatImageLoader } from "../src/stores/files/chatImageLoader";
import { ImageUnavailableError } from "../src/stores/files/ImageUnavailableError";

describe("conversation image loader", () => {
  it("should coalesce reads using the captured source instead of the currently selected source", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, value: { kind: "image", dataUrl: "data:image/png;base64,aGVsbG8=" } });
    const port = { request } as FileRequestPort;
    const loadImage = createChatImageLoader(port, "wsl", "/workspace/project");
    const loads = await Promise.all([loadImage("/home/user/image.png"), loadImage("/home/user/image.png")]);
    expect(loads).toEqual(["data:image/png;base64,aGVsbG8=", "data:image/png;base64,aGVsbG8="]);
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({ type: "images.read", sourceId: "wsl",
      projectPath: "/workspace/project", path: "/home/user/image.png" });
    await createChatImageLoader(port, "other-source", "/other/project")("/home/user/image.png");
    expect(request).toHaveBeenLastCalledWith({ type: "images.read", sourceId: "other-source",
      projectPath: "/other/project", path: "/home/user/image.png" });
  });

  it("should allow retry after source failures and refuse orphan images without any host fallback", async () => {
    const request = vi.fn().mockResolvedValueOnce({ ok: false, code: "unavailable", details: "Source offline" })
      .mockResolvedValue({ ok: true, value: { kind: "image", dataUrl: "data:image/png;base64,aGVsbG8=" } });
    const port = { request } as FileRequestPort;
    const loadImage = createChatImageLoader(port, "source", "/workspace");
    await expect(loadImage("image.png")).rejects.toThrow("Source offline");
    await expect(loadImage("image.png")).resolves.toBe("data:image/png;base64,aGVsbG8=");
    expect(request).toHaveBeenCalledTimes(2);
    request.mockClear();
    await expect(createChatImageLoader(port, null, "/workspace")("image.png"))
      .rejects.toThrow("This conversation has no image source.");
    expect(request).not.toHaveBeenCalled();
  });

  it("should classify missing images as expected absence and allow restored files to load", async () => {
    const request = vi.fn().mockResolvedValueOnce({ ok: false, code: "notFound", details: "File no longer exists" })
      .mockResolvedValue({ ok: true, value: { kind: "image", dataUrl: "data:image/png;base64,aGVsbG8=" } });
    const loadImage = createChatImageLoader({ request } as FileRequestPort, "source", "/workspace");
    await expect(loadImage("temporary.png")).rejects.toBeInstanceOf(ImageUnavailableError);
    await expect(loadImage("temporary.png")).resolves.toBe("data:image/png;base64,aGVsbG8=");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("should preserve genuine source and access errors instead of classifying them as missing files", async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, code: "unavailable", details: "Source offline" });
    const loadImage = createChatImageLoader({ request } as FileRequestPort, "source", "/workspace");
    const error = await loadImage("temporary.png").catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ImageUnavailableError);
    expect(error).toHaveProperty("message", "Source offline");
  });
});
