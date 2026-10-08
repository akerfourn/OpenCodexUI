import { describe, expect, it, vi } from "vitest";
import type { FileRequestPort } from "../src/stores/files/FileDocument";
import { createChatImageLoader } from "../src/stores/files/chatImageLoader";

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
});
