import type { OpenCodexAttachment } from "@open-codex-ui/opencodex-protocol";

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Reads actual transferred files, never interpreting copied text paths as file access. */
export function readTransferFiles(clipboard: Pick<DataTransfer, "files" | "items">): File[] {
  const files = Array.from(clipboard.files);
  if (files.length > 0) {
    return files;
  }
  return Array.from(clipboard.items)
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}

/** Converts a bounded file selection using the same attachment DTOs as the file picker. */
export async function readFileAttachments(files: File[]): Promise<OpenCodexAttachment[]> {
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  if (totalBytes > MAX_ATTACHMENT_BYTES) {
    throw new Error("Attachments exceed the 20 MiB size limit.");
  }
  return await Promise.all(files.map(readFileAttachment));
}

/** Preserves image previews and normalizes other MIME types to the backend's binary transport. */
function readFileAttachment(file: File): Promise<OpenCodexAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string" || !reader.result.includes(";base64,")) {
        reject(new Error("Unable to read attached file."));
        return;
      }
      const id = `attachment-${crypto.randomUUID()}`;
      const isImage = file.type.startsWith("image/");
      if (isImage) {
        resolve({ id, kind: "image", source: "dataUrl", value: reader.result,
          name: file.name || "pasted-image.png" });
        return;
      }
      const base64 = reader.result.slice(reader.result.indexOf(";base64,") + 8);
      resolve({ id, kind: "file", source: "dataUrl", name: file.name || "pasted-file",
        value: `data:application/octet-stream;base64,${base64}` });
    });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read attached file.")));
    reader.addEventListener("abort", () => reject(new Error("Reading attached file was cancelled.")));
    reader.readAsDataURL(file);
  });
}
