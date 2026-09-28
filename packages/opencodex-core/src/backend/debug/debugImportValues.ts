import path from "node:path";
import type { DebugImportIssue, OpenCodexFileContext } from "@open-codex-ui/opencodex-protocol";

/** Expands only deterministic workspace variables; never invokes commands or reads secrets. */
export function readImportString(
  value: unknown,
  field: string,
  context: OpenCodexFileContext,
  platform: string,
  issues: DebugImportIssue[]
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issues.push({ kind: "invalid", field });
    return undefined;
  }
  const paths = platform === "win32" ? path.win32 : path.posix;
  let unresolved = false;
  const expanded = value.replace(/\$\{([^}]+)\}/g, (match, variable: string) => {
    if (variable === "workspaceFolder") return context.workspacePath;
    if (variable === "workspaceFolderBasename") return paths.basename(context.workspacePath);
    if (variable === "pathSeparator" || variable === "/") return paths.sep;
    unresolved = true;
    issues.push({ kind: "variable", field: `${field}: ${match}` });
    return match;
  });
  return unresolved ? undefined : expanded;
}

/** Requires a complete argument vector; partially dropping arguments could change their meaning. */
export function readImportArguments(
  value: unknown,
  field: string,
  context: OpenCodexFileContext,
  platform: string,
  issues: DebugImportIssue[]
): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issues.push({ kind: "invalid", field });
    return undefined;
  }
  const args = value.map((arg) => readImportString(arg, field, context, platform, issues));
  if (args.some((arg) => arg === undefined)) return undefined;
  return args as string[];
}

/** Accepts only ordinary objects from JSON5, excluding arrays and nulls. */
export function importObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
