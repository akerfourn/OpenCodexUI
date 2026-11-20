import { createGitErrorMessage, type RunGit } from "./gitCommandRunner.js";

/** Checks only requested source-relative entries, without enumerating ignored directories. */
export async function readGitIgnoredPaths(
  runGit: RunGit, projectPath: string, sourceId: string, paths: string[]
): Promise<string[]> {
  if (!Array.isArray(paths) || paths.length > 200 || paths.some(path => typeof path !== "string"
    || path.length === 0 || path.length > 4096 || path.includes("\0") || /^[\\/]|^[a-z]:/i.test(path)
    || path.split(/[\\/]/).some(part => part === ".."))) {
    throw new Error("Ignored-file checks require at most 200 workspace-relative paths.");
  }
  if (paths.length === 0) return [];
  const repository = await runGit(projectPath, sourceId, ["rev-parse", "--is-inside-work-tree"], { allowFailure: true });
  if (repository.exitCode !== 0 || repository.stdout.trim() !== "true") return [];
  const ignored: string[] = [];
  const candidates = new Set(paths);
  for (const batch of batchPaths([...candidates])) {
    const result = await runGit(projectPath, sourceId, ["check-ignore", "-z", "--stdin"],
      { allowFailure: true, outputBytesCap: 1_000_000, stdin: `${batch.join("\0")}\0` });
    if (result.stdoutCapReached || result.stderrCapReached) throw new Error("Ignored-file check output was truncated.");
    if (result.exitCode !== 0 && result.exitCode !== 1) throw new Error(createGitErrorMessage(result));
    for (const path of result.stdout.split("\0")) {
      if (candidates.has(path)) ignored.push(path);
    }
  }
  return ignored;
}

/** Bounds stdin frames for all sources, including long Unicode names, without shell interpolation. */
function batchPaths(paths: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let bytes = 0;
  for (const path of paths) {
    const size = Buffer.byteLength(path, "utf8") + 3;
    if (batch.length > 0 && bytes + size > 12_000) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(path);
    bytes += size;
  }
  if (batch.length > 0) batches.push(batch);
  return batches;
}
