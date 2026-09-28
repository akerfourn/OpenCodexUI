import type { DebugConfiguration } from "./debug";

/** Explicit loss report for a best-effort launch.json conversion. */
export interface DebugImportIssue {
  kind: "ignored" | "invalid" | "variable" | "unsupported";
  field: string;
}

/** A preview is never executable until the user reviews and saves its draft. */
export interface DebugImportEntry {
  name: string;
  configuration: DebugConfiguration | null;
  issues: DebugImportIssue[];
}

/** Source-aware launch.json preview, without writes or automatic launches. */
export interface DebugImportPreview {
  entries: DebugImportEntry[];
  issues: DebugImportIssue[];
}
