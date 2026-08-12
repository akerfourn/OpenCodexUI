/**
 * Provides the Electron-native picker and preview loading for image attachments.
 */
import { dialog } from "electron";
import type { BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";

/**
 * Opens a native image picker.
 *
 * @param window Renderer window used as the dialog parent when available.
 * @returns Selected image attachments.
 */
export async function pickImageFiles(
  window: BrowserWindow | null
): Promise<OpenCodexImageAttachment[]> {
  const options = {
    properties: ["openFile", "multiSelections"] as Array<"openFile" | "multiSelections">,
    title: "Attach images",
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif"]
      }
    ]
  };
  const result = window === null
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(window, options);

  if (result.canceled) {
    return [];
  }

  return Promise.all(result.filePaths.map(createImageAttachmentFromPath));
}

/**
 * Creates an image attachment from a local file path.
 *
 * @param filePath Image file path selected by the user.
 * @param index Position of the file in the picker result.
 * @returns Image attachment with an optional data URL preview.
 */
export async function createImageAttachmentFromPath(
  filePath: string,
  index: number
): Promise<OpenCodexImageAttachment> {
  return {
    id: `attachment-${Date.now()}-${index}`,
    kind: "image",
    source: "localPath",
    value: filePath,
    name: path.basename(filePath),
    previewUrl: await readImagePreviewDataUrl(filePath)
  };
}

/**
 * Reads a local image as a base64 data URL for preview rendering.
 *
 * @param filePath Image file path to read.
 * @returns Base64 data URL, or `null` when reading fails.
 */
export async function readImagePreviewDataUrl(filePath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(filePath);
    const mimeType = readImageMimeType(filePath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Resolves the preview MIME type from an image file extension.
 *
 * @param filePath Image file path whose extension should be inspected.
 * @returns MIME type used for the image data URL.
 */
export function readImageMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }

  if (extension === ".webp") {
    return "image/webp";
  }

  if (extension === ".gif") {
    return "image/gif";
  }

  return "image/png";
}
