import { DEBUG_ADVANCED_RULES, parseDebugAdvancedOptions } from "@open-codex-ui/opencodex-protocol";
import type { DebugAdvancedOptions, DebugConfiguration } from "@open-codex-ui/opencodex-protocol";

/** Stable row IDs preserve focus when editing environment keys. */
export interface DebugEnvironmentRow { id: string; name: string; value: string; unset: boolean }

/** Raw editor buffers survive invalid input, failed saves and accordion closure. */
export interface DebugAdvancedDraft {
  environment: DebugEnvironmentRow[];
  envFile: string;
  runtimeArgs: string;
  stopOnEntry: boolean;
  json: string;
}

/** Splits the saved object into disjoint form and JSON fields without retaining observable data. */
export function createDebugAdvancedDraft(options: DebugAdvancedOptions = {}): DebugAdvancedDraft {
  const { env, envFile, runtimeArgs, stopOnEntry, ...custom } = options;
  return {
    environment: Object.entries(env ?? {}).map(([name, value], index) => ({
      id: `env-${index}`, name, value: value ?? "", unset: value === null
    })),
    envFile: envFile ?? "", runtimeArgs: JSON.stringify(runtimeArgs ?? []),
    stopOnEntry: stopOnEntry ?? false, json: JSON.stringify(custom, null, 2)
  };
}

/** Prevents hidden Node options from silently disappearing when switching target or mode. */
export function hasNodeAdvancedDraft(draft: DebugAdvancedDraft): boolean {
  return draft.environment.length > 0 || draft.envFile.trim().length > 0 ||
    draft.stopOnEntry || !["", "[]"].includes(draft.runtimeArgs.trim());
}

/** Validates buffers before transport; no changes reach the saved profile on failure. */
export function parseDebugAdvancedDraft(
  draft: DebugAdvancedDraft, target: DebugConfiguration["target"], request: DebugConfiguration["request"]
): DebugAdvancedOptions {
  const options = parseDebugAdvancedJson(draft.json);
  if (draft.environment.length > 0) {
    const names = draft.environment.map(row => row.name);
    if (new Set(names).size !== names.length) throw new Error("Environment variable names must be unique.");
    options.env = Object.fromEntries(draft.environment.map(row => [row.name, row.unset ? null : row.value]));
  }
  if (draft.envFile.trim().length > 0) options.envFile = draft.envFile;
  const args: unknown = JSON.parse(draft.runtimeArgs.trim() || "[]");
  if (!Array.isArray(args) || args.length > 0) options.runtimeArgs = args as string[];
  if (draft.stopOnEntry) options.stopOnEntry = true;
  return parseDebugAdvancedOptions(options, target, request);
}

/** Provides the same strict syntax and supported-field checks to live Monaco diagnostics and saving. */
export function parseDebugAdvancedJson(json: string): DebugAdvancedOptions {
  const custom: unknown = JSON.parse(json);
  const options = parseDebugAdvancedOptions(custom, "node", "launch");
  for (const key of Object.keys(options)) {
    if (DEBUG_ADVANCED_RULES[key as keyof typeof DEBUG_ADVANCED_RULES].scope === "nodeLaunch") {
      throw new Error(`Use the dedicated form field for ${key}, not the additional JSON options.`);
    }
  }
  return options;
}
