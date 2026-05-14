/**
 * Extracts command activity details from mapped turn items.
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

function readCommandFromContent(content: string): string {
  return content
    .replace(/^\s*(Commande|Command)\s*:\s*/i, "")
    .trim();
}

function readFirstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    const stringValue = readNullableString(value);

    if (stringValue !== null) {
      return stringValue;
    }
  }

  return null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readNullablePrimitive(value: unknown): string | null {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
