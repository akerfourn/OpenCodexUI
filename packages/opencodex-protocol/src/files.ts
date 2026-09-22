/** Immutable filesystem context captured when a document or explorer is opened. */
export interface OpenCodexFileContext {
  sourceId: string;
  projectId: string;
  workspaceId: string;
  workspacePath: string;
}

/** Source-relative path; separators are always forward slashes. */
export interface OpenCodexFileTarget extends OpenCodexFileContext {
  path: string;
}

/** One direct child; symbolic links are deliberately not followed. */
export interface OpenCodexFileEntry {
  name: string;
  kind: "directory" | "file" | "symlink" | "other";
}

/** UTF-8 document snapshot, including the format needed for lossless saves. */
export interface OpenCodexFileSnapshot {
  content: string;
  revision: string;
  bom: boolean;
  eol: "lf" | "crlf" | "mixed";
  readOnly: boolean;
}

/** Expected failures remain structured across IPC rather than losing error codes. */
export type OpenCodexFileErrorCode =
  | "unavailable"
  | "inaccessible"
  | "symlink"
  | "tooLarge"
  | "binary"
  | "encoding"
  | "conflict"
  | "readOnly"
  | "invalidPath";

export type OpenCodexFileResult<T> =
  { ok: true; value: T } | { ok: false; code: OpenCodexFileErrorCode; details: string };

/** Dedicated requests keep filesystem operations separate from composer search. */
export type OpenCodexFileRequest =
  | { type: "workspaceFiles.stat"; target: OpenCodexFileTarget }
  | { type: "workspaceFiles.list"; target: OpenCodexFileTarget }
  | { type: "workspaceFiles.read"; target: OpenCodexFileTarget }
  | { type: "workspaceFiles.check"; target: OpenCodexFileTarget; revision: string }
  | {
      type: "workspaceFiles.save";
      target: OpenCodexFileTarget;
      content: string;
      revision: string;
      bom: boolean;
    };
