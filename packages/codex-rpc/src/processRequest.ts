import { isRecord } from "./events";
import type { JsonRpcRequestContext, ProcessExecutableResolver } from "./types";

/** Resolves only the executable of an explicit host process, preserving argv and all process options. */
export async function resolveProcessRequest(
  method: string,
  params: unknown,
  resolve: ProcessExecutableResolver
): Promise<unknown> {
  if ((method !== "process/spawn" && method !== "command/exec") || !isRecord(params)) return params;
  if (!Array.isArray(params.command) || params.command.length === 0 || typeof params.command[0] !== "string"
    || typeof params.cwd !== "string") return params;
  let environment: Record<string, string | null> | undefined;
  if (isRecord(params.env)) {
    environment = {};
    for (const [name, value] of Object.entries(params.env)) {
      if (typeof value === "string" || value === null) environment[name] = value;
    }
  }
  const executable = await resolve(params.command[0], params.cwd, environment);
  if (executable === params.command[0]) return params;
  return { ...params, command: [executable, ...params.command.slice(1)] };
}

/** Captures enough context to locate spawn failures without recording potentially sensitive arguments. */
export function readRequestContext(method: string, params: unknown): JsonRpcRequestContext {
  const context: JsonRpcRequestContext = { method };
  if ((method !== "process/spawn" && method !== "command/exec") || !isRecord(params)) return context;
  if (Array.isArray(params.command) && typeof params.command[0] === "string") context.executable = params.command[0];
  if (typeof params.cwd === "string") context.cwd = params.cwd;
  return context;
}
