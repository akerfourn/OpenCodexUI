/** Metadata-only traversal shared by local workers and source-side Node processes. */
export const workspaceDiskUsageScript = String.raw`
/** Estimates one checkout without traversing links, Git metadata or another filesystem. */
async function measureWorkspaceDiskUsage(workspacePath) {
  const root = await fs.realpath(workspacePath);
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory()) fail('invalidPath', 'Workspace must be a directory.');
  const result = { logicalBytes: 0, allocatedBytes: process.platform === 'win32' ? null : 0, fileCount: 0, skippedLinks: 0,
    unreadableEntries: 0, complete: true, limitReached: false };
  const pending = [root];
  const seen = new Set();
  const seenDirectories = new Set();
  const started = Date.now();
  let entries = 0;

  /** Accumulates safe byte counts, falling back to logical sizes on unsupported filesystems. */
  function count(metadata) {
    if (metadata.isFile()) {
      const key = metadata.dev + ':' + metadata.ino;
      if (metadata.ino !== 0 && seen.has(key)) return;
      if (metadata.ino !== 0) seen.add(key);
      result.logicalBytes += metadata.size;
      result.fileCount += 1;
    }
    if (result.allocatedBytes !== null) {
      if (typeof metadata.blocks !== 'number' || metadata.blocks < 0) result.allocatedBytes = null;
      else result.allocatedBytes += metadata.blocks * 512;
    }
    if (!Number.isSafeInteger(result.logicalBytes) ||
        (result.allocatedBytes !== null && !Number.isSafeInteger(result.allocatedBytes))) {
      fail('tooLarge', 'Workspace size exceeds the supported numeric range.');
    }
  }

  /** Bounds work in huge or continually changing trees before the transport deadline. */
  function exhausted() {
    if (entries < 100000 && Date.now() - started < 20000) return false;
    result.complete = false;
    result.limitReached = true;
    return true;
  }

  while (pending.length > 0 && !exhausted()) {
    const directoryPath = pending.pop();
    try {
      const metadata = await fs.lstat(directoryPath);
      if (metadata.isSymbolicLink()) { result.skippedLinks += 1; continue; }
      if (!metadata.isDirectory() || await fs.realpath(directoryPath) !== directoryPath || metadata.dev !== rootStat.dev) {
        result.complete = false;
        result.unreadableEntries += 1;
        continue;
      }
      const key = metadata.dev + ':' + metadata.ino;
      if (metadata.ino !== 0 && seenDirectories.has(key)) continue;
      if (metadata.ino !== 0) seenDirectories.add(key);
      count(metadata);
      const directory = await fs.opendir(directoryPath);
      for await (const entry of directory) {
        if (exhausted()) break;
        entries += 1;
        if (entry.name.toLowerCase() === '.git') continue;
        try {
          const full = path.join(directoryPath, entry.name);
          const stat = await fs.lstat(full);
          if (stat.isSymbolicLink()) result.skippedLinks += 1;
          else if (stat.isDirectory()) pending.push(full);
          else if (stat.isFile()) count(stat);
        } catch (error) {
          if (error.fileCode) throw error;
          result.complete = false;
          result.unreadableEntries += 1;
        }
      }
    } catch (error) {
      if (directoryPath === root || error.fileCode) throw error;
      result.complete = false;
      result.unreadableEntries += 1;
    }
  }
  return result;
}
`;
