import { dialog, type BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { OpenCodexAttachment } from "@open-codex-ui/opencodex-protocol";
import { createImageAttachmentFromPath } from "./imageAttachmentPicker.js";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Selects files on the Electron host; non-image bytes travel to the selected Codex source. */
export async function pickAttachmentFiles(window: BrowserWindow | null): Promise<OpenCodexAttachment[]> {
  const options = { properties: ["openFile", "multiSelections"] as Array<"openFile" | "multiSelections"> };
  const result = window === null
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(window, options);
  if (result.canceled) {
    return [];
  }
  const attachments: OpenCodexAttachment[] = [];
  let totalBytes = 0;
  for (const filePath of result.filePaths) {
    const stat = await fs.stat(filePath);
    totalBytes += stat.size;
    if (!stat.isFile() || totalBytes > MAX_FILE_BYTES) {
      throw new Error("Attachments must be regular files totaling at most 20 MiB per selection.");
    }
    attachments.push(await createFileAttachmentFromPath(filePath));
  }
  return attachments;
}

/** Preserves existing image previews and encodes other files without relying on host paths. */
export async function createFileAttachmentFromPath(filePath: string): Promise<OpenCodexAttachment> {
  if (/\.(png|jpe?g|webp|gif)$/i.test(filePath)) {
    const image = await createImageAttachmentFromPath(filePath, 0);
    return { ...image, id: `attachment-${randomUUID()}` };
  }
  const bytes = await fs.readFile(filePath);
  if (bytes.length > MAX_FILE_BYTES) {
    throw new Error("Attachment exceeds the 20 MiB size limit.");
  }
  return {
    id: `attachment-${randomUUID()}`, kind: "file", source: "dataUrl",
    name: path.basename(filePath), value: `data:application/octet-stream;base64,${bytes.toString("base64")}`
  };
}
