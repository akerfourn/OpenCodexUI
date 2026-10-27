import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { openExternalLink } from "../src/main/externalLinkOpener";
import { resolveOpenTarget } from "../src/main/externalOpenTarget";

const mocks = vi.hoisted(() => ({
  stat: vi.fn(), openPath: vi.fn(), openExternal: vi.fn(), spawn: vi.fn(), which: vi.fn()
}));
vi.mock("node:fs/promises", () => ({ stat: mocks.stat }));
vi.mock("electron", () => ({ shell: { openPath: mocks.openPath, openExternal: mocks.openExternal } }));
vi.mock("cross-spawn", () => ({ default: mocks.spawn }));
vi.mock("which", () => ({ default: mocks.which }));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.stat.mockResolvedValue({ isDirectory: () => true });
  mocks.openPath.mockResolvedValue("");
  mocks.which.mockImplementation(async (command: string) => command);
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    queueMicrotask(() => child.emit("spawn"));
    return child;
  });
});

describe("folder link destination", () => {
  it("should open the parent of a file reference without launching the configured editor", async () => {
    mocks.stat.mockResolvedValue({ isDirectory: () => false });
    await openExternalLink("src/file.ts:12:4", "/work", "editor %F", {
      mode: "system", command: null, containing: true
    });
    expect(mocks.openPath).toHaveBeenCalledWith(path.resolve("/work/src"));
    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it("should open the directory itself for an encoded file URL", async () => {
    const directory = path.resolve("/work/folder with spaces");
    await openExternalLink(String(pathToFileURL(directory)), null, null, {
      mode: "system", command: null, containing: true
    });
    expect(mocks.openPath).toHaveBeenCalledWith(directory);
  });

  it("should open the original parent of a deleted file", async () => {
    mocks.stat.mockRejectedValue(Object.assign(new Error("missing"), { code: "ENOENT" }));
    await openExternalLink("src/deleted.ts", "/work", null, {
      mode: "system", command: null, containing: true
    });
    expect(mocks.openPath).toHaveBeenCalledWith(path.resolve("/work/src"));
  });

  it("should reject web links and relative references without a directory context", async () => {
    const folders = { mode: "system", command: null, containing: true } as const;
    await expect(openExternalLink("https://example.test/file", "/work", null, folders))
      .rejects.toThrow("Only host filesystem paths");
    await expect(openExternalLink("src/file.ts", null, null, folders))
      .rejects.toThrow("explicit project directory");
    expect(mocks.openPath).not.toHaveBeenCalled();
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it("should propagate permission errors without guessing a parent", async () => {
    mocks.stat.mockRejectedValue(Object.assign(new Error("permission denied"), { code: "EACCES" }));
    await expect(openExternalLink("src/file.ts", "/work", null, {
      mode: "system", command: null, containing: true
    })).rejects.toThrow("permission denied");
    expect(mocks.openPath).not.toHaveBeenCalled();
  });

  it("should open a real directory in the system file manager", async () => {
    await openExternalLink("sub.dir", "/work", "code --goto %F", { mode: "system", command: "code %D" });
    expect(mocks.openPath).toHaveBeenCalledWith(path.resolve("/work/sub.dir"));
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("should pass the clicked folder to the source folder command", async () => {
    await openExternalLink("sub.dir", "/work", "wrong-file-command", { mode: "external", command: "code %D" });
    expect(mocks.spawn).toHaveBeenCalledWith("code", [path.resolve("/work/sub.dir")], expect.any(Object));
    expect(mocks.openPath).not.toHaveBeenCalled();
  });

  it("should preserve files, web URLs and explicitly external actions", async () => {
    mocks.stat.mockResolvedValue({ isDirectory: () => false });
    await openExternalLink("LICENSE:12:4", "/work", "code --goto %F:%L:%C", { mode: "system", command: null });
    expect(mocks.spawn).toHaveBeenCalledWith("code", ["--goto", `${path.resolve("/work/LICENSE")}:12:4`], expect.any(Object));
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
    expect(resolveOpenTarget(`${pathToFileURL(path.resolve("/work/app.ts"))}#L12`, null))
      .toMatchObject({ type: "path", line: "12" });
    expect(resolveOpenTarget(`${pathToFileURL(path.resolve("/work/folder"))}#section`, null))
      .toMatchObject({ type: "path", value: path.resolve("/work/folder"), line: null });
  });
});
