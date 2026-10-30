/** Bounded metadata fingerprinting; never follows links or reads file contents. */
export const workspaceChangesScript = String.raw`
/** Fingerprints Git's explicit non-ignored file inventory inside the owning source. */
async function measureWorkspaceChanges(workspacePath, files) {
  if (!Array.isArray(files) || files.length > 100000) fail('tooLarge', 'Workspace file inventory exceeds 100000 entries.');
  const root = await fs.realpath(workspacePath);
  const normalize = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  if (normalize(root) !== normalize(workspacePath)) fail('symlink', 'Workspace path must not contain symbolic links.');
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('invalidPath', 'Workspace must be a literal directory.');
  const hash = crypto.createHash('sha256');
  const parents = new Set([root]);
  const started = Date.now();
  let complete = true;
  for (const relative of [...new Set(files)].sort()) {
    if (Date.now() - started > 20000) { complete = false; break; }
    if (typeof relative !== 'string' || relative.length === 0 || relative.includes('\0') || path.isAbsolute(relative)
      || relative.split(/[\\/]/u).some(part => part === '..' || part === '.git')) {
      fail('invalidPath', 'Invalid source-relative file inventory.');
    }
    const full = path.resolve(root, relative);
    if (!contains(root, full) || full === root) fail('invalidPath', 'File must belong to the workspace.');
    try {
      let parent = path.dirname(full);
      const pending = [];
      while (!parents.has(parent)) { pending.push(parent); parent = path.dirname(parent); }
      for (const directory of pending.reverse()) {
        const metadata = await fs.lstat(directory);
        if (!metadata.isDirectory() || metadata.isSymbolicLink() || metadata.dev !== rootStat.dev) {
          fail('symlink', 'File inventory contains a link or another filesystem.');
        }
        parents.add(directory);
      }
      // Revalidate cached parents: an external tool may have replaced one with a link during this scan.
      if (normalize(await fs.realpath(path.dirname(full))) !== normalize(path.dirname(full))) {
        complete = false;
        continue;
      }
      const stat = await fs.lstat(full, { bigint: true });
      // Directory entries are normally submodules; their internal activity is not a complete file observation.
      if (!stat.isFile() && !stat.isSymbolicLink()) { complete = false; continue; }
      if (stat.dev.toString() !== rootStat.dev.toString()) { complete = false; continue; }
      hash.update(JSON.stringify([relative, stat.size.toString(), stat.mtimeNs.toString(), stat.ctimeNs.toString(), stat.mode.toString()]));
      if (stat.isSymbolicLink()) hash.update(await fs.readlink(full));
    } catch (error) {
      if (error.code === 'ENOENT') hash.update(JSON.stringify([relative, 'missing']));
      else complete = false;
    }
  }
  const after = await fs.lstat(root);
  if (after.dev !== rootStat.dev || after.ino !== rootStat.ino) complete = false;
  return { fingerprint: hash.digest('hex'), complete };
}
`;
