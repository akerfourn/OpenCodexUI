/**
 * Extracts command activity details from mapped turn items.
 */

/**
 * Structured command activity details displayed by the command modal.
 */
export type CommandActivityDetails = {
  command: string;
  cwd: string | null;
  output: string | null;
  status: string | null;
  exitCode: string | null;
  durationMs: string | null;
  rawDetails: string | null;
};

/**
 * Reads a command activity payload from UI content and raw details.
 *
 * @param content Rendered activity content.
 * @param details Raw activity details JSON, when available.
 *
 * @returns Parsed command activity details.
 */
export function readCommandActivityDetails(
  content: string,
  details: string | null | undefined
): CommandActivityDetails {
  const payload = parseDetails(details);
  const command = readString(payload.command) || readCommandFromContent(content);
  const output = readFirstNonEmptyString([
    payload.aggregatedOutput,
    payload.output,
    payload.stdout,
    payload.stderr,
    payload.result
  ]);

  return {
    command,
    cwd: readNullableString(payload.cwd),
    output,
    status: readNullableString(payload.status),
    exitCode: readNullablePrimitive(payload.exitCode),
    durationMs: readNullablePrimitive(payload.durationMs),
    rawDetails: details ?? null
  };
}

/**
 * Parses raw JSON command activity details defensively.
 *
 * @param details Raw details string.
 * @returns Object payload, or an empty object when details are absent or invalid.
 */
function parseDetails(details: string | null | undefined): Record<string, unknown> {
  if (details === null || details === undefined || details.trim().length === 0) {
    return {};
  }

  try {
    const parsed = JSON.parse(details) as unknown;

    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

/**
 * Extracts a command from rendered activity text when raw details are missing.
 *
 * @param content Rendered activity content.
 * @returns Command text.
 */
function readCommandFromContent(content: string): string {
  return content
    .replace(/^\s*(Commande|Command)\s*:\s*/i, "")
    .trim();
}

/**
 * Reads the first non-empty string from candidate values.
 *
 * @param values Candidate raw values.
 * @returns First non-empty string, or `null`.
 */
function readFirstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    const stringValue = readNullableString(value);

    if (stringValue !== null) {
      return stringValue;
    }
  }

  return null;
}

/**
 * Reads a nullable non-empty string.
 *
 * @param value Raw value.
 * @returns String value, or `null`.
 */
function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads a nullable primitive value as display text.
 *
 * @param value Raw value.
 * @returns Stringified primitive, or `null`.
 */
function readNullablePrimitive(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

/**
 * Reads a string with an empty fallback.
 *
 * @param value Raw value.
 * @returns String value or an empty string.
 */
function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
