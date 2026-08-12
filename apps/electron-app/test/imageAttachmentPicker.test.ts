import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn()
}));

vi.mock("electron", () => ({
  dialog: {
    showOpenDialog: mocks.showOpenDialog
  }
}));

import {
  createImageAttachmentFromPath,
  pickImageFiles,
  readImageMimeType,
  readImagePreviewDataUrl
} from "../src/main/imageAttachmentPicker.js";

const imagePickerOptions = {
  properties: ["openFile", "multiSelections"],
  title: "Attach images",
  filters: [{
    name: "Images",
    extensions: ["png", "jpg", "jpeg", "webp", "gif"]
  }]
};

let temporaryRoot = "";
let testDirectory = "";

beforeAll(async () => {
  temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "open-codex-image-picker-"));
});

beforeEach(async () => {
  testDirectory = await fs.mkdtemp(path.join(temporaryRoot, "case-"));
  mocks.showOpenDialog.mockReset();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(testDirectory, { recursive: true, force: true });
  testDirectory = "";
});

afterAll(async () => {
  await fs.rm(temporaryRoot, { recursive: true, force: true });
});

describe("image attachment helpers", () => {
  it("should_map_supported_extensions_case_insensitively_and_default_unknown_types_to_png", () => {
    const cases: Array<[string, string]> = [
      ["picture.png", "image/png"],
      ["picture.PNG", "image/png"],
      ["picture.jpg", "image/jpeg"],
      ["picture.JPG", "image/jpeg"],
      ["picture.jpeg", "image/jpeg"],
      ["picture.JPEG", "image/jpeg"],
      ["picture.webp", "image/webp"],
      ["picture.WEBP", "image/webp"],
      ["picture.gif", "image/gif"],
      ["picture.GIF", "image/gif"],
      ["picture.bmp", "image/png"]
    ];

    for (const [filePath, expectedMimeType] of cases) {
      expect(readImageMimeType(filePath)).toBe(expectedMimeType);
    }
  });

  it("should_read_an_exact_data_url_and_return_null_for_a_missing_path", async () => {
    const filePath = await writeTestFile("small.png", "small image");

    await expect(readImagePreviewDataUrl(filePath)).resolves.toBe(
      "data:image/png;base64,c21hbGwgaW1hZ2U="
    );
    await expect(readImagePreviewDataUrl(path.join(testDirectory, "missing.png"))).resolves.toBeNull();
  });

  it("should_create_the_exact_attachment_dto_with_a_stable_timestamp_and_index", async () => {
    const filePath = await writeTestFile("avatar.jpg", "small image");
    vi.spyOn(Date, "now").mockReturnValue(1_725_000_000_123);

    await expect(createImageAttachmentFromPath(filePath, 4)).resolves.toEqual({
      id: "attachment-1725000000123-4",
      kind: "image",
      source: "localPath",
      value: filePath,
      name: "avatar.jpg",
      previewUrl: "data:image/jpeg;base64,c21hbGwgaW1hZ2U="
    });
  });
});

describe("pickImageFiles", () => {
  it("should_return_no_attachments_when_the_dialog_is_cancelled_without_a_browser_window", async () => {
    mocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await expect(pickImageFiles(null)).resolves.toEqual([]);

    expect(mocks.showOpenDialog).toHaveBeenCalledOnce();
    expect(mocks.showOpenDialog).toHaveBeenCalledWith(imagePickerOptions);
  });

  it("should_use_the_browser_window_and_preserve_file_order", async () => {
    const firstPath = await writeTestFile("first.png", "first image");
    const secondPath = await writeTestFile("second.GIF", "second image");
    const browserWindow = {} as BrowserWindow;
    vi.spyOn(Date, "now").mockReturnValue(1_725_000_000_456);
    mocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: [firstPath, secondPath]
    });

    await expect(pickImageFiles(browserWindow)).resolves.toEqual([
      {
        id: "attachment-1725000000456-0",
        kind: "image",
        source: "localPath",
        value: firstPath,
        name: "first.png",
        previewUrl: "data:image/png;base64,Zmlyc3QgaW1hZ2U="
      },
      {
        id: "attachment-1725000000456-1",
        kind: "image",
        source: "localPath",
        value: secondPath,
        name: "second.GIF",
        previewUrl: "data:image/gif;base64,c2Vjb25kIGltYWdl"
      }
    ]);

    expect(mocks.showOpenDialog).toHaveBeenCalledOnce();
    expect(mocks.showOpenDialog).toHaveBeenCalledWith(browserWindow, imagePickerOptions);
  });
});

/**
 * Writes a fixture file inside the current isolated test directory.
 *
 * @param fileName Fixture file name.
 * @param contents Text content to write.
 * @returns Absolute path to the fixture file.
 */
async function writeTestFile(fileName: string, contents: string): Promise<string> {
  const filePath = path.join(testDirectory, fileName);
  await fs.writeFile(filePath, contents);
  return filePath;
}
