import { DEBUG_ADVANCED_RULES } from "@open-codex-ui/opencodex-protocol";
import type { DebugAdvancedOptions, DebugConfiguration, DebugImportIssue } from "@open-codex-ui/opencodex-protocol";
import { resolveDebugAdvancedOptions } from "./debugAdvancedOptions.js";

/** Imports only adapter options available for this target, retaining explicit loss warnings. */
export function importDebugAdvancedOptions(
  raw: Record<string, unknown>, config: DebugConfiguration, platform: string,
  consumed: Set<string>, issues: DebugImportIssue[]
): void {
  const advanced: DebugAdvancedOptions = {};
  for (const [field, rule] of Object.entries(DEBUG_ADVANCED_RULES)) {
    if (raw[field] === undefined || consumed.has(field)) continue;
    if (rule.scope === "nodeLaunch" && (config.target !== "node" || config.request !== "launch")) continue;
    consumed.add(field);
    try {
      Object.assign(advanced, resolveDebugAdvancedOptions({ ...config, advanced: { [field]: raw[field] } }, platform));
    } catch (error) {
      const unresolved = error instanceof Error && error.message.startsWith("Unresolved variable");
      issues.push({ kind: unresolved ? "variable" : "invalid", field });
    }
  }
  if (Object.keys(advanced).length > 0) config.advanced = advanced;
}
