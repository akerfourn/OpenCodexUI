import { stat } from "node:fs/promises";
import path from "node:path";
import type { ProcessExecutableResolver } from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";

/** Native lookup effects can be replaced without mocking path and source isolation rules. */
export interface SourceExecutableLookupOptions {
  platform?: NodeJS.Platform;
  environment?: NodeJS.ProcessEnv;
  isFile?(filePath: string): Promise<boolean>;
  now?(): number;
}

/** Rejects POSIX and drive-relative paths rather than interpreting them in the host's filesystem. */
function isQualifiedWindowsPath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\");
}

/** Tests an actual file while treating ordinary inaccessible/missing PATH candidates as unavailable. */
async function isExecutableFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "EACCES" || code === "EPERM") return false;
    throw error;
  }
}

/** Snapshots Windows environment keys with the same case-insensitive semantics as native process creation. */
function windowsEnvironment(environment: NodeJS.ProcessEnv): Map<string, string> {
  const values = new Map<string, string>();
  for (const name of Object.keys(environment).sort()) {
    const value = environment[name];
    const key = name.toUpperCase();
    if (key !== "PATH" && key !== "SYSTEMROOT") continue;
    if (value !== undefined && !values.has(key)) values.set(key, value);
  }
  return values;
}

/** Builds native executable candidates, validating files before bypassing Codex's PATH parser. */
function executableCandidates(program: string, cwd: string, environment: Map<string, string>): string[] {
  const directories: string[] = [];
  const systemRoot = environment.get("SYSTEMROOT");
  if (systemRoot !== undefined && isQualifiedWindowsPath(systemRoot)) {
    directories.push(path.win32.join(systemRoot, "System32"));
    if (/^powershell(?:\.exe)?$/i.test(program)) {
      directories.push(path.win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0"));
    }
  }
  for (const entry of (environment.get("PATH") ?? "").split(";")) {
    // Quotes are invalid in Windows file names. Validate the resulting candidate rather than letting
    // one stray quote hide all later PATH entries, as can happen in Rust's Windows PATH parsing.
    const directory = entry.trim().replace(/^"+|"+$/g, "");
    if (directory.length > 0) directories.push(path.win32.resolve(cwd, directory));
  }
  let names = [program];
  if (path.win32.extname(program).length === 0) names = [`${program}.exe`, `${program}.com`];
  const candidates: string[] = [];
  for (const directory of directories) {
    for (const name of names) candidates.push(path.win32.join(directory, name));
  }
  return candidates;
}

/**
 * Resolves process/spawn and command/exec names only for proven host-local Windows sources.
 * argv is preserved, no shell is introduced, and no command is executed twice.
 */
export function createSourceExecutableResolver(
  source: Pick<CachedSource, "kind">,
  options: SourceExecutableLookupOptions = {}
): ProcessExecutableResolver | undefined {
  const platform = options.platform ?? process.platform;
  if (source.kind !== "local" || platform !== "win32") return undefined;
  const inherited = windowsEnvironment(options.environment ?? process.env);
  const isFile = options.isFile ?? isExecutableFile;
  const now = options.now ?? Date.now;
  const cache = new Map<string, { expiresAt: number; result: Promise<string> }>();

  /** Keeps explicit paths and unsupported script launchers intact; only native bare names use lookup. */
  return async (program, cwd, overrides) => {
    if (program.length === 0 || /[\\/]/.test(program) || !isQualifiedWindowsPath(cwd)) return program;
    const extension = path.win32.extname(program).toLowerCase();
    if (extension.length > 0 && extension !== ".exe" && extension !== ".com") return program;
    const environment = new Map(inherited);
    for (const [name, value] of Object.entries(overrides ?? {})) {
      const key = name.toUpperCase();
      if (key !== "PATH" && key !== "SYSTEMROOT") continue;
      if (value === null) environment.delete(key);
      else environment.set(key, value);
    }
    const candidates = executableCandidates(program, cwd, environment);
    const key = JSON.stringify([program, candidates]);
    const previous = cache.get(key);
    if (previous !== undefined && previous.expiresAt > now()) return await previous.result;
    if (cache.size >= 256) cache.clear();
    const result = findExecutableWithinBudget(program, candidates, isFile);
    cache.set(key, { expiresAt: now() + 30_000, result });
    try {
      const executable = await result;
      if (executable === program) cache.delete(key);
      return executable;
    } catch (error) {
      cache.delete(key);
      throw error;
    }
  };
}

/** Bounds optional host lookup so slow network PATH entries cannot delay a command indefinitely. */
async function findExecutableWithinBudget(
  program: string, candidates: string[], isFile: (filePath: string) => Promise<boolean>
): Promise<string> {
  const state = { cancelled: false };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      findExecutable(program, candidates, isFile, state),
      new Promise<string>(resolve => {
        timer = setTimeout(() => { state.cancelled = true; resolve(program); }, 2_000);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** Returns a verified executable, stopping further filesystem checks after the optional lookup expires. */
async function findExecutable(
  program: string, candidates: string[], isFile: (filePath: string) => Promise<boolean>, state: { cancelled: boolean }
): Promise<string> {
  for (const candidate of candidates) {
    if (state.cancelled) return program;
    const found = await isFile(candidate);
    if (state.cancelled) return program;
    if (found) return candidate;
  }
  return program;
}
