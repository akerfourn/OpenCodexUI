import path from "node:path";
import { parseDebugAdvancedOptions } from "@open-codex-ui/opencodex-protocol";
import type { DebugAdvancedOptions, DebugConfiguration, DebugImportIssue } from "@open-codex-ui/opencodex-protocol";
import { readImportString } from "./debugImportValues.js";

/** Resolves supported options inside the captured workspace without expanding host secrets or commands. */
export function resolveDebugAdvancedOptions(config: DebugConfiguration, platform: string = process.platform): DebugAdvancedOptions {
  const options = parseDebugAdvancedOptions(config.advanced, config.target, config.request);
  const issues: DebugImportIssue[] = [];
  /** Variable expansion is recursive only through the bounded supported option shapes. */
  function expand(value: string, field: string): string {
    const result = readImportString(value, field, config.context, platform, issues);
    if (result === undefined) throw new Error(`Unresolved variable in advanced option: ${field}`);
    return result;
  }
  const paths = platform === "win32" ? path.win32 : path.posix;
  if (options.env !== undefined) {
    options.env = Object.fromEntries(Object.entries(options.env).map(([key, value]) =>
      [key, value === null ? null : expand(value, "env")]));
  }
  if (options.envFile !== undefined) {
    options.envFile = paths.resolve(config.context.workspacePath, expand(options.envFile, "envFile"));
  }
  if (options.runtimeArgs !== undefined) options.runtimeArgs = options.runtimeArgs.map(value => expand(value, "runtimeArgs"));
  for (const field of ["skipFiles", "outFiles", "resolveSourceMapLocations"] as const) {
    if (options[field] !== undefined) options[field] = options[field].map(value => expand(value, field).replaceAll("\\", "/"));
  }
  if (options.sourceMapPathOverrides !== undefined) {
    options.sourceMapPathOverrides = Object.fromEntries(Object.entries(options.sourceMapPathOverrides)
      .map(([key, value]) => [expand(key, "sourceMapPathOverrides"), expand(value, "sourceMapPathOverrides")]));
  }
  return options;
}
