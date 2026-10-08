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

/** Read-only image bytes transported from the owning source without host paths. */
export interface OpenCodexImageSnapshot {
  kind: "image";
  dataUrl: string;
  mimeType: string;
  byteLength: number;
  revision: string;
  readOnly: true;
}

/** Bounded PDF bytes transported from the owning source, never a host filesystem URL. */
export interface OpenCodexPdfSnapshot {
  kind: "pdf";
  dataBase64: string;
  byteLength: number;
  revision: string;
  readOnly: true;
}

/** Binary previews retain the existing UTF-8 snapshot shape for text files. */
export type OpenCodexFileReadSnapshot = OpenCodexFileSnapshot | OpenCodexImageSnapshot | OpenCodexPdfSnapshot;

/** Bounded image-only preview in the conversation's explicit source filesystem. */
export interface OpenCodexImageReadRequest {
  type: "images.read";
  sourceId: string;
  projectPath: string | null;
  path: string;
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
  | "alreadyExists"
  | "operationLimit"
  | "unsupported"
  | "invalidPath";

export type OpenCodexFileResult<T> =
  { ok: true; value: T } | { ok: false; code: OpenCodexFileErrorCode; details: string };

/** Dedicated requests keep filesystem operations separate from composer search. */
export type OpenCodexFileRequest =
  | { type: "workspaceFiles.copy"; target: OpenCodexFileTarget; destinationPath: string; name: string }
  | { type: "workspaceFiles.rename"; target: OpenCodexFileTarget; name: string }
  | { type: "workspaceFiles.delete"; target: OpenCodexFileTarget }
  | { type: "workspaceFiles.linkAccess"; target: OpenCodexFileTarget }
  | { type: "workspaceFiles.setLinkAccess"; target: OpenCodexFileTarget;
      destination: string; access: OpenCodexFileAccess }
  | { type: "workspaceFiles.stat"; target: OpenCodexFileTarget }
  | { type: "workspaceFiles.list"; target: OpenCodexFileTarget }
  | { type: "workspaceFiles.read"; target: OpenCodexFileTarget; previewImages?: boolean; previewPdf?: boolean }
  | { type: "workspaceFiles.check"; target: OpenCodexFileTarget; revision: string; previewImages?: boolean; previewPdf?: boolean }
  | {
      type: "workspaceFiles.save";
      target: OpenCodexFileTarget;
      content: string;
      revision: string;
      bom: boolean;
    };
