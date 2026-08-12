import { fileURLToPath } from "node:url";
import path from "node:path";

export type OpenTarget =
  | { type: "url"; value: string }
  | {
      type: "path";
      value: string;
      line: string | null;
      column: string | null;
    };

export type OpenCommandContext = {
  projectPath: string | null;
  filePath: string;
  relativePath: string;
  line: string | null;
  column: string | null;
};

/**
 * Resolves a link into either a URL target or a filesystem path target.
 *
 * @param href Link value emitted by the UI.
 * @param projectPath Current project path used as the base for relative paths.
 * @returns Normalized target description that can be opened by Electron.
 */
export function resolveOpenTarget(href: string, projectPath: string | null): OpenTarget {
  try {
    const url = new URL(href);

    if (url.protocol === "file:") {
      const location = readLocation(fileURLToPath(url));
      return {
        type: "path",
        value: location.path,
        line: location.line,
        column: location.column
      };
    }

    return { type: "url", value: href };
  } catch {
    const location = readLocation(href);
    const cleanedPath = location.path;

    if (path.isAbsolute(cleanedPath)) {
      return { type: "path", value: cleanedPath, line: location.line, column: location.column };
    }

    if (projectPath !== null) {
      return {
        type: "path",
        value: path.resolve(projectPath, cleanedPath),
        line: location.line,
        column: location.column
      };
    }

    return {
      type: "path",
      value: path.resolve(process.cwd(), cleanedPath),
      line: location.line,
      column: location.column
    };
  }
}

/**
 * Replaces source opener placeholders inside one command argument.
 *
 * @param value Command argument.
 * @param context Placeholder values.
 * @returns Argument with placeholders replaced.
 */
export function substituteOpenCommandPlaceholder(
  value: string,
  context: OpenCommandContext
): string {
  return value
    .replaceAll("%D", context.projectPath ?? "")
    .replaceAll("%F", context.filePath)
    .replaceAll("%R", context.relativePath)
    .replaceAll("%L", context.line ?? "")
    .replaceAll("%C", context.column ?? "");
}

/**
 * Splits a simple command line into executable and arguments.
 *
 * @param value Command line to split.
 * @returns Command-line parts with quoted segments preserved.
 */
export function splitCommandLine(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: "\"" | "'" | null = null;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if ((character === "\"" || character === "'") && quote === null) {
      quote = character;
      continue;
    }

    if (character === quote) {
      quote = null;
      continue;
    }

    if (character === " " && quote === null) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += character;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

/**
 * Removes editor location suffixes from a path-like value.
 *
 * @param value File path or URL-derived path that may include line or column hints.
 * @returns Clean filesystem path without location metadata.
 */
export function readLocation(value: string): { path: string; line: string | null; column: string | null } {
  const lineHashMatch = /#L(\d+)(?:-L\d+)?$/i.exec(value);

  if (lineHashMatch !== null) {
    return {
      path: value.slice(0, lineHashMatch.index),
      line: lineHashMatch[1] ?? null,
      column: null
    };
  }

  const suffixMatch = /:(\d+)(?::(\d+))?$/.exec(value);

  if (suffixMatch !== null) {
    return {
      path: value.slice(0, suffixMatch.index),
      line: suffixMatch[1] ?? null,
      column: suffixMatch[2] ?? null
    };
  }

  return { path: value, line: null, column: null };
}
