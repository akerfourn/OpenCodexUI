/** Supported adapter options, persisted with the profile rather than global settings. */
export interface DebugAdvancedOptions {
  env?: Record<string, string | null>;
  envFile?: string;
  runtimeArgs?: string[];
  stopOnEntry?: boolean;
  sourceMaps?: boolean;
  smartStep?: boolean;
  skipFiles?: string[];
  outFiles?: string[];
  resolveSourceMapLocations?: string[];
  sourceMapPathOverrides?: Record<string, string>;
}

/** The form owns Node launch fields; the JSON editor owns common source/stepping options. */
export const DEBUG_ADVANCED_RULES = {
  env: { kind: "environment", scope: "nodeLaunch" },
  envFile: { kind: "string", scope: "nodeLaunch" },
  runtimeArgs: { kind: "arguments", scope: "nodeLaunch" },
  stopOnEntry: { kind: "boolean", scope: "nodeLaunch" },
  sourceMaps: { kind: "boolean", scope: "common" },
  smartStep: { kind: "boolean", scope: "common" },
  skipFiles: { kind: "patterns", scope: "common" },
  outFiles: { kind: "patterns", scope: "common" },
  resolveSourceMapLocations: { kind: "patterns", scope: "common" },
  sourceMapPathOverrides: { kind: "mapping", scope: "common" }
} as const;

/** Checks untrusted JSON at both the editor and backend boundaries and returns a plain copy. */
export function parseDebugAdvancedOptions(
  value: unknown, target: "node" | "chrome", request: "launch" | "attach"
): DebugAdvancedOptions {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new Error("Advanced options must be a JSON object.");
  const result: Record<string, unknown> = {};
  for (const [field, option] of Object.entries(value)) {
    if (!Object.hasOwn(DEBUG_ADVANCED_RULES, field)) throw new Error(`Unsupported advanced option: ${field}`);
    const rule = DEBUG_ADVANCED_RULES[field as keyof typeof DEBUG_ADVANCED_RULES];
    if (rule.scope === "nodeLaunch" && (target !== "node" || request !== "launch")) {
      throw new Error(`Option ${field} is only available for Node.js launch configurations.`);
    }
    if (rule.kind === "boolean") {
      if (typeof option !== "boolean") throw new Error(`Option ${field} must be a boolean.`);
      result[field] = option;
    } else if (rule.kind === "string") {
      if (!validString(option) || option.trim().length === 0) throw new Error(`Option ${field} must be a non-empty string.`);
      result[field] = option;
    } else if (rule.kind === "arguments" || rule.kind === "patterns") {
      if (!Array.isArray(option) || option.length > 1000 || !option.every(item =>
        validString(item) && (rule.kind === "arguments" || item.trim().length > 0))) {
        throw new Error(`Option ${field} must be an array of strings (at most 1000).`);
      }
      result[field] = [...option];
    } else {
      result[field] = parseMapping(option, field, rule.kind === "environment");
    }
  }
  if (JSON.stringify(result).length > 128 * 1024) throw new Error("Advanced options exceed the 128 KiB limit.");
  return result as DebugAdvancedOptions;
}

/** Rejects scalar values and arrays before examining mapping entries. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** NUL bytes cannot be represented in process arguments or filesystem paths. */
function validString(value: unknown): value is string {
  return typeof value === "string" && !value.includes("\0");
}

/** Validates maps without exposing their potentially private values in error messages. */
function parseMapping(value: unknown, field: string, environment: boolean): Record<string, string | null> {
  if (!isRecord(value) || Object.keys(value).length > 1000) throw new Error(`Invalid mapping: ${field}`);
  const entries = Object.entries(value);
  for (const [key, item] of entries) {
    const validKey = key.length > 0 && !key.includes("\0") && (!environment || !key.includes("="));
    const validValue = validString(item) || (environment && item === null);
    if (!validKey || !validValue) throw new Error(`Invalid entry in ${field}.`);
    if (environment && key.toUpperCase() === "ELECTRON_RUN_AS_NODE") {
      throw new Error("ELECTRON_RUN_AS_NODE is managed by OpenCodexUI.");
    }
  }
  return Object.fromEntries(entries) as Record<string, string | null>;
}
