import type { BrowserWindow } from "electron";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ showOpenDialog: vi.fn() }));
vi.mock("electron", () => ({ dialog: { showOpenDialog: mocks.showOpenDialog } }));

import { pickExecutableFile, pickProjectDirectory } from "../src/main/projectDialogPickers.js";

describe("project dialog pickers", () => {
  const parentWindow = { id: 42 } as BrowserWindow;

  beforeEach(() => {
    mocks.showOpenDialog.mockReset();
  });

  it("should open a directory picker without a parent and preserve the selected Windows path", async () => {
    const selectedPath = "C:\\projects\\RocketLantern";
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [selectedPath] });

    expect(await pickProjectDirectory(null, "open")).toBe(selectedPath);
    expect(mocks.showOpenDialog).toHaveBeenCalledWith({
      properties: ["openDirectory"],
      title: "Open project folder"
    });
  });

  it("should allow directory creation and attach the picker to the supplied window", async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/projects/new"] });

    expect(await pickProjectDirectory(parentWindow, "create")).toBe("/projects/new");
    expect(mocks.showOpenDialog).toHaveBeenCalledWith(parentWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Create or select project folder"
    });
  });

  it("should attach the executable picker to the supplied window and return the first selected file", async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/bin/codex", "/bin/other"] });

    expect(await pickExecutableFile(parentWindow)).toBe("/bin/codex");
    expect(mocks.showOpenDialog).toHaveBeenCalledWith(parentWindow, {
      properties: ["openFile"],
      title: "Select Codex executable"
    });
  });

  it("should open the executable picker without a parent when no window is attached", async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ["/bin/codex"] });

    expect(await pickExecutableFile(null)).toBe("/bin/codex");
    expect(mocks.showOpenDialog).toHaveBeenCalledWith({
      properties: ["openFile"],
      title: "Select Codex executable"
    });
  });

  it.each([
    { canceled: true, filePaths: ["/ignored/path"] },
    { canceled: false, filePaths: [] }
  ])("should return null for both pickers when the result is $canceled with $filePaths", async (result) => {
    mocks.showOpenDialog.mockResolvedValue(result);

    expect(await pickProjectDirectory(parentWindow, "open")).toBeNull();
    expect(await pickExecutableFile(parentWindow)).toBeNull();
  });

  it("should propagate native dialog failures from both pickers", async () => {
    const error = new Error("Native dialog unavailable");
    mocks.showOpenDialog.mockRejectedValue(error);

    await expect(pickProjectDirectory(null, "open")).rejects.toBe(error);
    await expect(pickExecutableFile(null)).rejects.toBe(error);
  });
});
