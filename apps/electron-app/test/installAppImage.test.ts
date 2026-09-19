import { beforeEach, describe, expect, it, vi } from "vitest";
import { chmod, copyFile, mkdtemp, rename, rm } from "node:fs/promises";
import { installAppImage } from "../src/main/installAppImage.js";

vi.mock("node:fs/promises", () => ({
  chmod: vi.fn(), copyFile: vi.fn(), mkdtemp: vi.fn(), rename: vi.fn(), rm: vi.fn(),
}));

describe("AppImage replacement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(mkdtemp).mockResolvedValue("/apps/.opencodex-update-test");
  });

  it("should preserve a custom filename and replace only after copying completes", async () => {
    let complete!: () => void;
    vi.mocked(copyFile).mockReturnValue(new Promise<void>((resolve) => { complete = resolve; }));
    const pending = installAppImage("/cache/OpenCodexUI-2.0.0.AppImage", "/apps/My App.AppImage");
    await Promise.resolve();
    expect(rename).not.toHaveBeenCalled();
    expect(rm).not.toHaveBeenCalled();
    complete();
    expect(await pending).toBe("/apps/My App.AppImage");
    expect(chmod).toHaveBeenCalledWith("/apps/.opencodex-update-test/update.AppImage", 0o755);
    expect(rename).toHaveBeenCalledWith(
      "/apps/.opencodex-update-test/update.AppImage", "/apps/My App.AppImage",
    );
    expect(rm).toHaveBeenCalledOnce();
    expect(rm).toHaveBeenCalledWith(
      "/apps/.opencodex-update-test", { recursive: true, force: true },
    );
  });

  it("should adopt the new versioned name before removing the old version", async () => {
    await installAppImage("/cache/App-2.0.0.AppImage", "/apps/App-1.0.0.AppImage");
    expect(rename).toHaveBeenCalledWith(
      "/apps/.opencodex-update-test/update.AppImage", "/apps/App-2.0.0.AppImage",
    );
    expect(rm).toHaveBeenCalledWith("/apps/App-1.0.0.AppImage", { force: true });
    expect(vi.mocked(rename).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(rm).mock.invocationCallOrder[0]!);
  });

  it("should preserve the old application and cached download if copying fails", async () => {
    vi.mocked(copyFile).mockRejectedValue(new Error("Disk full"));
    await expect(installAppImage("/cache/new.AppImage", "/apps/old.AppImage")).rejects.toThrow("Disk full");
    expect(rename).not.toHaveBeenCalled();
    expect(rm).toHaveBeenCalledOnce();
    expect(rm).toHaveBeenCalledWith(
      "/apps/.opencodex-update-test", { recursive: true, force: true },
    );
  });

  it("should keep the old version when the staged replacement cannot be installed", async () => {
    vi.mocked(rename).mockRejectedValue(new Error("Permission denied"));
    await expect(installAppImage("/cache/App-2.0.0.AppImage", "/apps/App-1.0.0.AppImage"))
      .rejects.toThrow("Permission denied");
    expect(rm).toHaveBeenCalledOnce();
    expect(rm).toHaveBeenCalledWith(
      "/apps/.opencodex-update-test", { recursive: true, force: true },
    );
  });
});
