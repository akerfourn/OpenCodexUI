import { parse, stringify, type TomlTable } from "smol-toml";
import { browserPermissionResources, type BrowserPermissionEntry,
  type BrowserPermissionChange } from "@open-codex-ui/opencodex-protocol";

/** Parses the plugin's internal format without coercing unknown numeric settings. */
export function parseBrowserPermissions(content: string): TomlTable {
  try {
    const document = parse(content, { integersAsBigInt: true, unsafeKeyBehaviour: "throw" });
    readBrowserPermissionEntries(document);
    return document;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`BROWSER_FORMAT: ${detail}`);
  }
}

/** Rejects incompatible known tables rather than silently replacing their contents. */
export function readBrowserPermissionEntries(document: TomlTable): BrowserPermissionEntry[] {
  const entries: BrowserPermissionEntry[] = [];
  for (const resource of browserPermissionResources) {
    const section = document[resource];
    if (section === undefined) continue;
    if (typeof section !== "object" || section === null || Array.isArray(section) || section instanceof Date) {
      throw new Error(`BROWSER_FORMAT: ${resource} must be a table.`);
    }
    for (const decision of ["allowed", "denied"] as const) {
      const patterns = (section as TomlTable)[decision];
      if (patterns === undefined) continue;
      if (!Array.isArray(patterns) || patterns.some(pattern => typeof pattern !== "string")) {
        throw new Error(`BROWSER_FORMAT: ${resource}.${decision} must be an array of strings.`);
      }
      for (const pattern of new Set(patterns as string[])) entries.push({ resource, decision, pattern });
    }
  }
  return entries;
}

/** Changes one exact saved pattern, removing contradictory decisions in the same file. */
export function changeBrowserPermission(content: string, change: BrowserPermissionChange): string {
  if (!browserPermissionResources.includes(change.resource) ||
    !["allowed", "denied", "reset"].includes(change.decision) ||
    typeof change.pattern !== "string" || change.pattern.trim().length === 0 ||
    change.pattern.length > 2048 || /[\0\r\n]/u.test(change.pattern)) {
    throw new Error("BROWSER_INVALID: Invalid browser permission.");
  }
  const document = parseBrowserPermissions(content);
  const section = (document[change.resource] ?? {}) as TomlTable;
  if (change.decision === "reset" && document[change.resource] === undefined) return content;
  document[change.resource] = section;
  for (const decision of ["allowed", "denied"] as const) {
    const previous = section[decision] as string[] | undefined;
    if (previous !== undefined) {
      section[decision] = previous.filter(pattern => pattern !== change.pattern);
    }
  }
  if (change.decision !== "reset") {
    const patterns = (section[change.decision] ?? []) as string[];
    section[change.decision] = [...patterns, change.pattern];
  }
  return `${stringify(document, { numbersAsFloat: true }).trimEnd()}\n`;
}
