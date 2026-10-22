import type { OpenCodexFileContext } from "./files.js";

/** Bounded source-side estimate, excluding every .git entry and symbolic-link target. */
export interface OpenCodexWorkspaceDiskUsageValues {
  logicalBytes: number;
  /** Allocated blocks when the source exposes them for every counted entry; otherwise unknown. */
  allocatedBytes: number | null;
  fileCount: number;
  skippedLinks: number;
  unreadableEntries: number;
  complete: boolean;
  limitReached: boolean;
}

/** Volatile observation tied to the reviewed physical workspace, never a deletion guarantee. */
export interface OpenCodexWorkspaceDiskUsage extends OpenCodexFileContext, OpenCodexWorkspaceDiskUsageValues {
  measuredAt: string;
}

/** Rejects malformed helper results instead of displaying a misleading zero or partial total. */
export function isWorkspaceDiskUsageValues(value: unknown): value is OpenCodexWorkspaceDiskUsageValues {
  if (typeof value !== "object" || value === null) return false;
  const data = value as Record<string, unknown>;
  const counters = [data.logicalBytes, data.fileCount, data.skippedLinks, data.unreadableEntries];
  if (data.allocatedBytes !== null) counters.push(data.allocatedBytes);
  return counters.every(counter => typeof counter === "number" && Number.isSafeInteger(counter) && counter >= 0)
    && typeof data.complete === "boolean" && typeof data.limitReached === "boolean"
    && (data.complete === false || (data.limitReached === false && data.unreadableEntries === 0));
}
