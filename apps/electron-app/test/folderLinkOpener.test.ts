import { beforeEach, describe, expect, it, vi } from "vitest";
import { openExternalLink } from "../src/main/externalLinkOpener";
import { resolveOpenTarget } from "../src/main/externalOpenTarget";

const mocks = vi.hoisted(() => ({
  stat: vi.fn(), openPath: vi.fn(), openExternal: vi.fn(), spawn: vi.fn()
}));
vi.mock("node:fs/promises", () => ({ stat: mocks.stat }));
vi.mock("electron", () => ({ shell: { openPath: mocks.openPath, openExternal: mocks.openExternal } }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.stat.mockResolvedValue({ isDirectory: () => true });
  mocks.openPath.mockResolvedValue("");
  mocks.spawn.mockReturnValue({ unref: vi.fn() });
});

describe("folder link destination", () => {
  it("should open a real directory in the system file manager", async () => {
    await openExternalLink("sub.dir", "/work", "code --goto %F", { mode: "system", command: "code %D" });
    expect(mocks.openPath).toHaveBeenCalledWith("/work/sub.dir");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("should pass the clicked folder to the source folder command", async () => {
    await openExternalLink("sub.dir", "/work", "wrong-file-command", { mode: "external", command: "code %D" });
    expect(mocks.spawn).toHaveBeenCalledWith("code", ["/work/sub.dir"], expect.any(Object));
    expect(mocks.openPath).not.toHaveBeenCalled();
  });

  it("should preserve files, web URLs and explicitly external actions", async () => {
    mocks.stat.mockResolvedValue({ isDirectory: () => false });
    await openExternalLink("LICENSE:12:4", "/work", "code --goto %F:%L:%C", { mode: "system", command: null });
    expect(mocks.spawn).toHaveBeenCalledWith("code", ["--goto", "/work/LICENSE:12:4"], expect.any(Object));
    mocks.stat.mockClear();
    await openExternalLink("https://example.org", "/work", "code", { mode: "system", command: null });
    await openExternalLink("/work", "/work", "code %D");
    expect(mocks.stat).not.toHaveBeenCalled();
    expect(mocks.openPath).not.toHaveBeenCalled();
    expect(mocks.openExternal).toHaveBeenCalledWith("https://example.org");
  });

  it("should surface file manager errors", async () => {
    mocks.openPath.mockResolvedValue("Could not open folder");
    await expect(openExternalLink("/work", null, null, { mode: "system", command: null }))
      .rejects.toThrow("Could not open folder");
  });

  it("should distinguish Windows and UNC paths from URL protocols", () => {
    expect(resolveOpenTarget("C:\\work\\folder", null)).toMatchObject({ type: "path", value: "C:\\work\\folder" });
    expect(resolveOpenTarget("\\\\server\\share", null)).toMatchObject({ type: "path", value: "\\\\server\\share" });
    expect(resolveOpenTarget("file:///work/app.ts#L12", null)).toMatchObject({ type: "path", line: "12" });
    expect(resolveOpenTarget("file:///work/folder#section", null)).toMatchObject({ type: "path", value: "/work/folder", line: null });
  });
});
