/** One checkout frozen before moving the project's principal directory. */
export interface OpenCodexPrimaryMoveCheckout {
  path: string;
  destinationPath: string;
  identity: string;
  gitDirectory: string;
  gitIdentity: string;
  markerHash: string | null;
  head: string | null;
  branch: string | null;
  bare: boolean;
}

/** Backend-owned recovery evidence; renderer requests never supply this snapshot. */
export interface OpenCodexPrimaryMoveSnapshot {
  identity: string;
  /** All active project workspaces are reserved, including those staying outside the moved directory. */
  members: Array<{ workspaceId: string; path: string; destinationPath: string }>;
  git: { commonDirectory: string; checkouts: OpenCodexPrimaryMoveCheckout[] } | null;
}

/** Source-native directory observation used only by the move backend. */
export interface OpenCodexDirectoryIdentity {
  identity: string;
  markerKind: "missing" | "file" | "directory";
  markerHash: string | null;
  looksBare: boolean;
}
