import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ showOpenDialog: vi.fn() }));
vi.mock("electron", () => ({ dialog: { showOpenDialog: mocks.showOpenDialog } }));
import { pickAttachmentFiles } from "../src/main/fileAttachmentPicker.js";

let directory: string;
beforeEach(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "opencodex-file-picker-"));
  mocks.showOpenDialog.mockReset();
});
afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

describe("file attachment picker", () => {
  it("should select arbitrary files alongside images with distinct representations", async () => {
    const document = path.join(directory, "report.pdf");
    const image = path.join(directory, "picture.png");
    await fs.writeFile(document, "sample pdf bytes");
    await fs.writeFile(image, "sample image bytes");
    mocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [document, image] });

    const picked = await pickAttachmentFiles(null);

    expect(mocks.showOpenDialog).toHaveBeenCalledWith({ properties: ["openFile", "multiSelections"] });
    expect(picked[0]).toMatchObject({ kind: "file", source: "dataUrl", name: "report.pdf",
      value: `data:application/octet-stream;base64,${Buffer.from("sample pdf bytes").toString("base64")}` });
    expect(picked[1]).toMatchObject({ kind: "image", source: "localPath", value: image,
      previewUrl: expect.stringContaining("data:image/png;base64,") });
  });

  it("should keep cancellation empty and reject files larger than the selection limit", async () => {
    mocks.showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] });
    expect(await pickAttachmentFiles(null)).toEqual([]);
    const large = path.join(directory, "large.bin");
    await fs.writeFile(large, "");
    await fs.truncate(large, 20 * 1024 * 1024 + 1);
    mocks.showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: [large] });
    await expect(pickAttachmentFiles(null)).rejects.toThrow("20 MiB");
  });
});
