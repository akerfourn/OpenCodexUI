import type { OpenCodexProjectWorkspace } from "./workspaces";

/** A Git entry that explicit discovery could not safely associate with this project. */
export interface OpenCodexWorkspaceDiscoverySkipped {
  /** Source-native path reported by Git. */
  path: string;
  /** Stable reason for displaying a conflict without silently merging projects. */
  reason: "anotherProject" | "creationPending" | "removed"
    | "unavailable" | "repositoryMismatch" | "unsupportedPath";
}

/** Discovery preserves existing catalogue entries and reports unadopted Git paths separately. */
export interface OpenCodexWorkspaceDiscoveryResult {
  /** Complete retained catalogue, including previously known workspaces. */
  workspaces: OpenCodexProjectWorkspace[];
  /** Entries excluded from adoption, without deleting their files or cache history. */
  skipped: OpenCodexWorkspaceDiscoverySkipped[];
}
