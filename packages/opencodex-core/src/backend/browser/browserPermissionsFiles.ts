import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserPermissionsFile } from "@open-codex-ui/opencodex-protocol";
import { parseBrowserPermissions, readBrowserPermissionEntries } from "./browserPermissionsFormat.js";

const MAX_CONFIG_BYTES = 1024 * 1024;

/** Keeps the original bytes available for conflict checks and backup creation. */
export interface BrowserPermissionsDocument {
  file: BrowserPermissionsFile;
  content: string | null;
  mode: number;
}

/** Returns a bounded regular file, treating only a missing file as an empty configuration. */
export async function readBrowserPermissionsFile(filePath: string): Promise<BrowserPermissionsDocument> {
  let content: string | null = null;
  let mode = 0o600;
  try {
    const metadata = await lstat(filePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_CONFIG_BYTES) {
      throw new Error("BROWSER_FORMAT: Expected a bounded regular permissions file.");
    }
    mode = metadata.mode & 0o777;
    content = await readFile(filePath, "utf8");
    if (Buffer.byteLength(content, "utf8") > MAX_CONFIG_BYTES) {
      throw new Error("BROWSER_FORMAT: Permissions file is too large.");
    }
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
  const entries = readBrowserPermissionEntries(parseBrowserPermissions(content ?? ""));
  const revision = createHash("sha256").update(content === null ? "missing" : `file:${content}`).digest("hex");
  return { file: { path: filePath, entries, revision }, content, mode };
}

/** Replaces a file atomically after checking its revision and retaining the previous bytes. */
export async function writeBrowserPermissionsFile(
  original: BrowserPermissionsDocument,
  content: string
): Promise<void> {
  const filePath = original.file.path;
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${randomUUID()}.tmp`;
  const temporaryBackup = `${temporary}.bak`;
  try {
    const handle = await open(temporary, "wx", original.mode);
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    const current = await readBrowserPermissionsFile(filePath);
    if (current.file.revision !== original.file.revision) {
      throw new Error("BROWSER_CONFLICT: Permissions changed. Refresh before saving.");
    }
    if (original.content !== null) {
      await writeFile(temporaryBackup, original.content, { mode: 0o600, flag: "wx" });
    }
    const latest = await readBrowserPermissionsFile(filePath);
    if (latest.file.revision !== original.file.revision) {
      throw new Error("BROWSER_CONFLICT: Permissions changed. Refresh before saving.");
    }
    if (original.content !== null) await rename(temporaryBackup, `${filePath}.opencodexui.bak`);
    await rename(temporary, filePath);
  } finally {
    await unlink(temporary).catch(error => { if (!isMissingFile(error)) throw error; });
    await unlink(temporaryBackup).catch(error => { if (!isMissingFile(error)) throw error; });
  }
}

/** Distinguishes a missing file from permission, I/O and parser failures. */
function isMissingFile(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}
