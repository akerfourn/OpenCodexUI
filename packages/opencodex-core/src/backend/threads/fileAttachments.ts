import { createHash } from "node:crypto";
import path from "node:path";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexAttachment, OpenCodexFileAttachment } from "@open-codex-ui/opencodex-protocol";

const FILE_INPUT_PREFIX = "[OpenCodexUI attached file]\n";
const MAX_FILE_BYTES = 20 * 1024 * 1024;

/** Copies generic files to the explicit source before sending any model request. */
export async function prepareFileAttachments(
  client: Pick<CodexAppServerClient, "getCodexHome" | "createDirectory" | "writeFile" | "getMetadata">,
  sourceId: string,
  attachments: OpenCodexAttachment[]
): Promise<OpenCodexAttachment[]> {
  const prepared: OpenCodexAttachment[] = [];
  let totalBytes = 0;
  for (const attachment of attachments) {
    if (attachment.kind === "image") {
      prepared.push(attachment);
      continue;
    }
    if (attachment.source === "localPath") {
      if (attachment.sourceId !== sourceId) {
        throw new Error("The attached file belongs to another Codex source; attach it again.");
      }
      const metadata = await client.getMetadata(attachment.value);
      if (!metadata.isFile) {
        throw new Error("The attached file is no longer a regular file; attach it again.");
      }
      prepared.push(attachment);
      continue;
    }
    const match = /^data:application\/octet-stream;base64,([A-Za-z0-9+/]*={0,2})$/.exec(attachment.value);
    const dataBase64 = match?.[1];
    if (dataBase64 === undefined || dataBase64.length > Math.ceil(MAX_FILE_BYTES / 3) * 4) {
      throw new Error("Invalid file attachment or attachment exceeds 20 MiB.");
    }
    const bytes = Buffer.from(dataBase64, "base64");
    totalBytes += bytes.length;
    if (totalBytes > MAX_FILE_BYTES || bytes.toString("base64") !== dataBase64) {
      throw new Error("Invalid file attachment or attachments exceed 20 MiB per message.");
    }
    const home = await client.getCodexHome();
    const paths = /^[A-Za-z]:[\\/]|^\\\\/.test(home) ? path.win32 : path.posix;
    if (!paths.isAbsolute(home)) {
      throw new Error("Codex returned a relative attachment storage root.");
    }
    const hash = createHash("sha256").update(bytes).digest("hex");
    const directory = paths.join(home, "opencodex-ui", "attachments", hash);
    const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
    const filename = "attachment-" + (safeName.replace(/[. ]+$/, "") || "file");
    const destination = paths.join(directory, filename);
    await client.createDirectory(directory);
    await client.writeFile(destination, dataBase64);
    prepared.push({
      id: attachment.id, kind: "file", source: "localPath", sourceId,
      value: destination, name: attachment.name
    });
  }
  return prepared;
}

/** Adds a durable, self-describing file reference to Codex history instead of embedding file bytes. */
export function fileAttachmentInput(attachment: OpenCodexFileAttachment): string {
  if (attachment.source !== "localPath") {
    throw new Error("File attachment must be transferred before starting a turn.");
  }
  return FILE_INPUT_PREFIX + JSON.stringify({ name: attachment.name, path: attachment.value, sourceId: attachment.sourceId });
}

/** Recovers our file references after history synchronization without changing ordinary text. */
export function readFileAttachmentInput(text: string, id: string): OpenCodexFileAttachment | null {
  if (!text.startsWith(FILE_INPUT_PREFIX)) {
    return null;
  }
  try {
    const value = JSON.parse(text.slice(FILE_INPUT_PREFIX.length));
    if (typeof value.name !== "string" || typeof value.path !== "string" || typeof value.sourceId !== "string") {
      return null;
    }
    return { id, kind: "file", source: "localPath", value: value.path, name: value.name, sourceId: value.sourceId };
  } catch {
    return null;
  }
}
