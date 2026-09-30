/** Source-side entry operations share the worker's path validation and permission checks. */
export const fileMutationScript = String.raw`
/** Accepts a single portable filename, never a path or a Windows device name. */
function validateEntryName(name) {
  if (typeof name !== 'string' || name.length === 0 || name === '.' || name === '..' ||
      /[\\/<>:"|?*\x00-\x1f]/.test(name) || /[. ]$/.test(name) ||
      /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) {
    fail('invalidPath', 'Expected a valid single file or folder name.');
  }
}

/** Resolves only the parent so entry mutations never follow the final symbolic link. */
async function resolveEntry(target, permissions) {
  if (typeof target.path !== 'string' || target.path.length === 0 ||
      target.path.startsWith('/') || target.path.endsWith('/')) {
    fail('invalidPath', 'The workspace root cannot be copied, renamed or deleted.');
  }
  const parts = target.path.split('/');
  const name = parts.pop();
  if (name === '.' || name === '..' || /[\\:\x00]/.test(name)) {
    fail('invalidPath', 'Expected a workspace-relative entry path.');
  }
  const parentPath = parts.join('/');
  const parent = await resolveTarget({ ...target, path: parentPath }, permissions);
  const full = path.join(parent.full, name);
  const metadata = await fs.lstat(full);
  return { full, parent, parentPath, name, metadata };
}

/** Enforces inherited grants and the source OS directory write permission. */
async function requireWritableDirectory(directory) {
  if (directory.readOnly) fail('readOnly', 'External access is read-only.');
  const metadata = await fs.stat(directory.full);
  if (!metadata.isDirectory()) fail('invalidPath', 'The destination must be a directory.');
  if ((metadata.mode & 0o222) === 0) fail('readOnly', 'The parent directory is read-only.');
  await fs.access(directory.full, constants.W_OK);
}

/** Refuses collisions including dangling links; no existing entry is deliberately overwritten. */
async function requireMissingEntry(full) {
  try { await fs.lstat(full); }
  catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  fail('alreadyExists', 'An entry with this name already exists.');
}

/** Bounds recursive work without traversing symbolic links or opening special files. */
async function inspectMutationTree(full, budget, copying) {
  const metadata = await fs.lstat(full);
  budget.entries += 1;
  if (budget.entries > 10000) fail('operationLimit', 'Maximum operation size: 10,000 entries.');
  if (metadata.isSymbolicLink()) return;
  if (metadata.isFile()) {
    budget.bytes += metadata.size;
    if (copying && budget.bytes > 256 * 1024 * 1024) {
      fail('operationLimit', 'Maximum copy size: 256 MiB.');
    }
    return;
  }
  if (!metadata.isDirectory()) fail('unsupported', 'Special filesystem entries are not supported.');
  const directory = await fs.opendir(full);
  for await (const entry of directory) {
    await inspectMutationTree(path.join(full, entry.name), budget, copying);
  }
}

/** Copies into a private sibling first so failures do not expose an incomplete destination. */
async function copyEntry(entry, destination) {
  await inspectMutationTree(entry.full, { entries: 0, bytes: 0 }, true);
  const temporary = await fs.mkdtemp(path.join(path.dirname(destination), '.opencodex-copy-'));
  try {
    const staged = path.join(temporary, 'entry');
    let entries = 0;
    let bytes = 0;
    await fs.cp(entry.full, staged, {
      recursive: true, dereference: false, verbatimSymlinks: true, force: false, errorOnExist: true,
      /** Rechecks limits if the source tree changes after preflight. */
      filter: async source => {
        const metadata = await fs.lstat(source);
        entries += 1;
        if (metadata.isFile()) bytes += metadata.size;
        if (entries > 10000 || bytes > 256 * 1024 * 1024) fail('operationLimit', 'Copy limit exceeded.');
        if (!metadata.isFile() && !metadata.isDirectory() && !metadata.isSymbolicLink()) {
          fail('unsupported', 'Special filesystem entries are not supported.');
        }
        return true;
      }
    });
    await requireMissingEntry(destination);
    await fs.rename(staged, destination);
  } finally { await fs.rm(temporary, { recursive: true, force: true }); }
}

/** Mutates entries only in the explicitly selected workspace and source filesystem. */
async function mutateEntry(request) {
  const entry = await resolveEntry(request.target, request.permissions);
  if (!entry.metadata.isFile() && !entry.metadata.isDirectory() && !entry.metadata.isSymbolicLink()) {
    fail('unsupported', 'Special filesystem entries are not supported.');
  }
  if (request.type === 'workspaceFiles.delete') {
    await requireWritableDirectory(entry.parent);
    await inspectMutationTree(entry.full, { entries: 0, bytes: 0 }, false);
    await fs.rm(entry.full, { recursive: true });
    return { path: request.target.path };
  }
  validateEntryName(request.name);
  const destinationPath = request.type === 'workspaceFiles.rename' ? entry.parentPath : request.destinationPath;
  const directory = await resolveTarget({ ...request.target, path: destinationPath }, request.permissions);
  await requireWritableDirectory(directory);
  const destination = path.join(directory.full, request.name);
  if (entry.metadata.isDirectory() && contains(entry.full, destination)) {
    fail('invalidPath', 'A folder cannot be copied or moved into itself.');
  }
  await requireMissingEntry(destination);
  if (request.type === 'workspaceFiles.rename') {
    await requireWritableDirectory(entry.parent);
    await fs.rename(entry.full, destination);
  } else {
    await copyEntry(entry, destination);
  }
  return { path: [destinationPath, request.name].filter(Boolean).join('/') };
}
`;
