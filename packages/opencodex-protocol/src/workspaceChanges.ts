import type { OpenCodexFileContext } from "./files.js";

/** Dated Git/file observation; authorship and exact edit times cannot be inferred. */
export interface OpenCodexWorkspaceChanges extends OpenCodexFileContext {
  checkedAt: string;
  /** Null until two complete observations differ; the first observation only establishes a baseline. */
  lastChangedAt: string | null;
  hasChanges: boolean;
  /** Cached observations are display-only; only a new complete check can support cleanup suggestions. */
  state: "checked" | "cached" | "partial";
}
