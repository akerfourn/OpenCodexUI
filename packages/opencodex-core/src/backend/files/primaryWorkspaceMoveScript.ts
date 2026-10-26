/** Source-native directory inspection and rename; paths are JSON data, not shell fragments. */
export const primaryWorkspaceMoveScript = String.raw`
/** Rejects symlink ancestors and records a stable filesystem identity, without writing a marker file. */
async function inspectMoveDirectory(full) {
  if (typeof full !== 'string' || !path.isAbsolute(full) || full.includes('\0')) fail('invalidPath', 'An absolute source path is required.');
  let current = full;
  for (;;) {
    const stat = await fs.lstat(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('invalidPath', 'Move paths require literal directory ancestors.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const stat = await fs.lstat(full, { bigint: true });
  if (stat.ino === 0n) fail('unsupported', 'This filesystem does not expose a stable directory identity.');
  let markerKind = 'missing';
  let markerHash = null;
  try {
    const marker = path.join(full, '.git');
    const metadata = await fs.lstat(marker);
    if (metadata.isSymbolicLink()) fail('invalidPath', 'Symbolic Git markers cannot be moved automatically.');
    if (metadata.isDirectory()) markerKind = 'directory';
    else if (metadata.isFile() && metadata.size <= 65536) {
      markerKind = 'file';
      const handle = await fs.open(marker, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
      try {
        const buffer = Buffer.alloc(65537);
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
        if (bytesRead > 65536) fail('tooLarge', 'Git marker is too large.');
        markerHash = crypto.createHash('sha256').update(buffer.subarray(0, bytesRead)).digest('hex');
      } finally { await handle.close(); }
    } else fail('invalidPath', 'Unsupported Git marker.');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  let looksBare = false;
  if (markerKind === 'missing') {
    try { looksBare = (await fs.lstat(path.join(full, 'HEAD'))).isFile() && (await fs.lstat(path.join(full, 'objects'))).isDirectory(); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return { identity: String(stat.dev) + ':' + String(stat.ino) + ':' + String(stat.birthtimeNs), markerKind, markerHash, looksBare };
}

/** Performs a single same-filesystem rename after rechecking both endpoints; no copy/delete fallback. */
async function primaryDirectoryOperation(request) {
  const source = request.target.workspacePath;
  if (request.operation === 'inspect') return await inspectMoveDirectory(source);
  if (request.operation !== 'rename') fail('invalidPath', 'Unknown directory operation.');
  const destination = request.destinationPath;
  if (!path.isAbsolute(destination) || destination.includes('\0')) fail('invalidPath', 'An absolute destination is required.');
  const relative = path.relative(source, destination);
  const reverse = path.relative(destination, source);
  const inside = value => value === '' || (value !== '..' && !value.startsWith('..' + path.sep) && !path.isAbsolute(value));
  if (inside(relative) || inside(reverse)) fail('invalidPath', 'Move paths cannot contain each other.');
  const before = await inspectMoveDirectory(source);
  if (before.identity !== request.identity) fail('conflict', 'Project directory identity changed before movement.');
  await inspectMoveDirectory(path.dirname(destination));
  try { await fs.lstat(destination); fail('conflict', 'Move destination already exists.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const sourceStat = await fs.lstat(source, { bigint: true });
  const parentStat = await fs.lstat(path.dirname(destination), { bigint: true });
  if (sourceStat.dev !== parentStat.dev) fail('unsupported', 'Moving a project across filesystems requires a manual move and relocation.');
  await fs.rename(source, destination);
  return await inspectMoveDirectory(destination);
}
`;
