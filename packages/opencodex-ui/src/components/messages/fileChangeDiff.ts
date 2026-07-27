/**
 * Parses file-change details into entries suitable for a visual diff view.
 */

export type FileChangeDiffEntry = {
  path: string | null;
  kind: string;
  diff: string;
};

export type FileChangeDiffData = {
  raw: string;
  changes: FileChangeDiffEntry[];
};

/**
 * Parses historical or aggregated file-change details.
 *
 * @param rawDetails Serialized file-change details.
 * @returns Parsed diff data, or `null` when no visual diff can be extracted.
 */
export function parseFileChangeDiff(rawDetails: string): FileChangeDiffData | null {
  const trimmedDetails = rawDetails.trim();

  if (trimmedDetails.length === 0) {
    return null;
  }

  const structuredChanges = parseStructuredChanges(trimmedDetails);

  if (structuredChanges.length > 0) {
    return {
      raw: rawDetails,
      changes: structuredChanges
    };
  }

  if (looksLikeUnifiedDiff(rawDetails)) {
    return {
      raw: rawDetails,
      changes: [{
        path: null,
        kind: "update",
        diff: rawDetails
      }]
    };
  }

  return null;
}

/**
 * Reads structured file changes from serialized activity details.
 *
 * @param rawDetails Serialized activity details.
 * @returns Entries containing a usable diff.
 */
function parseStructuredChanges(rawDetails: string): FileChangeDiffEntry[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawDetails) as unknown;
  } catch {
    return [];
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.changes)) {
    return [];
  }

  return parsed.changes
    .map(readFileChangeEntry)
    .filter((entry): entry is FileChangeDiffEntry => entry !== null);
}

/**
 * Reads one structured file-change entry.
 *
 * @param value Raw entry from serialized activity details.
 * @returns Parsed entry, or `null` when its diff is unavailable.
 */
function readFileChangeEntry(value: unknown): FileChangeDiffEntry | null {
  if (!isRecord(value)) {
    return null;
  }

  const diff = readString(value.diff);

  if (diff.length === 0) {
    return null;
  }

  const path = readString(value.path);

  return {
    path: path.length > 0 ? path : null,
    kind: readString(value.kind) || "update",
    diff
  };
}

/**
 * Checks whether plain text contains a recognizable unified diff.
 *
 * @param value Candidate diff text.
 * @returns Whether the text can be rendered as a unified diff.
 */
function looksLikeUnifiedDiff(value: string): boolean {
  return value.split(/\r?\n/).some((line) => (
    line.startsWith("@@") ||
    line.startsWith("diff --git ") ||
    line.startsWith("--- ") ||
    line.startsWith("+++ ")
  ));
}

/**
 * Narrows an unknown value to a string-keyed record.
 *
 * @param value Value to inspect.
 * @returns Whether the value is a record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a string value with an empty fallback.
 *
 * @param value Value to inspect.
 * @returns String value or an empty string.
 */
function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
