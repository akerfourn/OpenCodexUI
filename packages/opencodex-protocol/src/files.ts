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

/** File-module permission for one canonical external destination. */
export type OpenCodexFileAccess = "denied" | "readOnly" | "readWrite";

/** Persisted permission scoped to an immutable workspace and source identity. */
export interface OpenCodexFileGrant extends OpenCodexFileContext {
  destination: string;
  access: OpenCodexFileAccess;
}

/** Metadata available without reading a symbolic link's target contents. */
export interface OpenCodexFileLinkAccess {
  destination: string;
  access: OpenCodexFileAccess;
  external: boolean;
}

/** One direct child; accessible symbolic links expose the resolved target kind. */
export interface OpenCodexFileEntry {
  name: string;
  kind: "directory" | "file" | "symlink" | "other";
  /** Raw link destination for display only, never a host filesystem path. */
  linkTarget?: string;
  /** Reason a symbolic link cannot be followed inside this workspace. */
  linkError?: OpenCodexFileErrorCode;
  /** Canonical destination and effective permission, resolved by the source. */
  linkAccess?: OpenCodexFileLinkAccess;
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
  | "accessDenied"
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
  | { type: "workspaceFiles.linkAccess"; target: OpenCodexFileTarget }
  | { type: "workspaceFiles.setLinkAccess"; target: OpenCodexFileTarget;
      destination: string; access: OpenCodexFileAccess }
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
