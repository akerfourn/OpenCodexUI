import type { OpenCodexSource } from "./messages";

/** Browser plugin tables supported by the current compatibility adapter. */
export const browserPermissionResources = ["origins", "downloads", "uploads", "full_cdp"] as const;
export type BrowserPermissionResource = typeof browserPermissionResources[number];
export type BrowserPermissionDecision = "allowed" | "denied";

/** Explicit source and optional conversation owning a permissions file. */
export interface BrowserPermissionsContext {
  sourceId: string;
  threadId: string | null;
}

/** One saved plugin rule; patterns are preserved exactly when read. */
export interface BrowserPermissionEntry {
  resource: BrowserPermissionResource;
  pattern: string;
  decision: BrowserPermissionDecision;
}

/** Editable rules and an opaque revision used to detect external changes. */
export interface BrowserPermissionsFile {
  path: string;
  revision: string;
  entries: BrowserPermissionEntry[];
}

/** Global settings are included in chat views to explain inherited restrictions. */
export interface BrowserPermissionsSnapshot {
  context: BrowserPermissionsContext;
  file: BrowserPermissionsFile;
  global: BrowserPermissionsFile | null;
}

/** A targeted mutation preserves all other settings and unknown plugin fields. */
export interface BrowserPermissionChange {
  resource: BrowserPermissionResource;
  pattern: string;
  decision: BrowserPermissionDecision | "reset";
}

export type BrowserPermissionsRequest =
  | { type: "browserPermissions.read"; context: BrowserPermissionsContext }
  | { type: "browserPermissions.change"; context: BrowserPermissionsContext;
      revision: string; change: BrowserPermissionChange }
  | { type: "browserPermissions.reload"; sourceId: string };

/** Only sources that explicitly expose host-local files support this adapter. */
export function supportsBrowserPermissions(
  source: Pick<OpenCodexSource, "kind" | "settings"> | null
): boolean {
  return source !== null && (source.kind === "local" ||
    (source.kind === "custom" && "hasLocalAccess" in source.settings && source.settings.hasLocalAccess));
}
