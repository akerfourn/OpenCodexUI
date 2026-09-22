/**
 * Source-portable Node helper. The same program runs in a local worker or through
 * the source's process API. Input is JSON data, never interpolated into code.
 * Symlinks require workspace-scoped grants outside the selected root.
 * Hash comparison is optimistic:
 * filesystems do not expose a portable compare-and-rename against other tools.
 */
export const fileWorkerScript = String.raw`
const fs = require('node:fs/promises');
const constants = require('node:fs').constants;
const path = require('node:path');
const crypto = require('node:crypto');
const { parentPort, workerData } = require('node:worker_threads');
const MAX_BYTES = 2 * 1024 * 1024;

/** Creates a structured filesystem failure. */
function fail(code, message) {
  throw Object.assign(new Error(message), { fileCode: code });
}

/** Tests containment using the source OS path rules, not host-side heuristics. */
function contains(root, full) {
  const distance = path.relative(root, full);
  return distance !== '..' && !distance.startsWith('..' + path.sep) && !path.isAbsolute(distance);
}

/** Resolves paths, checking each external link before reading any target contents. */
async function resolveTarget(target, permissions = [], inspectLink = false) {
  const relative = target.path;
  if (typeof relative !== 'string' || relative.includes('\\') || relative.includes('\0') ||
      relative.startsWith('/') || relative.includes(':') ||
      relative.split('/').some(part => part === '..' || part === '.')) {
    fail('invalidPath', 'Expected a workspace-relative path.');
  }
  const root = await fs.realpath(target.workspacePath);
  let full = root;
  let readOnly = false;
  let linkAccess;
  const ancestors = new Set([root]);
  const parts = relative.split('/').filter(Boolean);
  for (const [index, part] of parts.entries()) {
    const next = path.join(full, part);
    const metadata = await fs.lstat(next);
    full = await fs.realpath(next);
    if (ancestors.has(full)) fail('symlink', 'Symbolic link points to an ancestor directory.');
    ancestors.add(full);
    const external = !contains(root, full);
    if (metadata.isSymbolicLink()) {
      let access = 'readWrite';
      if (external) {
        const grant = permissions.find(item => item.destination === full);
        access = grant?.access || 'denied';
      }
      if (readOnly && access === 'readWrite') access = 'readOnly';
      linkAccess = { destination: full, external, access };
      if (access === 'denied' && !(inspectLink && index === parts.length - 1)) {
        fail('accessDenied', 'Access to this external symbolic link has not been authorized.');
      }
      readOnly ||= access !== 'readWrite';
    } else {
      linkAccess = undefined;
    }
  }
  return { full, root, readOnly, linkAccess };
}

/** Inspects a final link only; parent paths still require normal authorization. */
async function inspectAccess(target, permissions) {
  const resolved = await resolveTarget(target, permissions, true);
  if (!resolved.linkAccess) fail('invalidPath', 'The selected entry is no longer a symbolic link.');
  return resolved;
}

/** Reads at most the supported limit, including when a file grows while reading. */
async function readSnapshot(full, root, policyReadOnly = false) {
  const handle = await fs.open(full, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) fail('binary', 'Only regular text files can be opened.');
    if (before.size > BigInt(MAX_BYTES)) fail('tooLarge', 'Maximum supported size: 2 MiB.');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const next = await handle.read(bytes, length, bytes.length - length, null);
      if (next.bytesRead === 0) break;
      length += next.bytesRead;
    }
    if (length > MAX_BYTES) fail('tooLarge', 'Maximum supported size: 2 MiB.');
    const after = await handle.stat({ bigint: true });
    if (before.mtimeNs !== after.mtimeNs || before.size !== after.size) {
      fail('conflict', 'File changed while being read; retry.');
    }
    const data = bytes.subarray(0, length);
    if (data.includes(0)) fail('binary', 'Binary or UTF-16 files are not supported.');
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(data); }
    catch { fail('encoding', 'Only valid UTF-8 text is editable.'); }
    if (/[\x01-\x08\x0b\x0e-\x1f]/.test(content)) fail('binary', 'Binary content is not supported.');
    const bom = content.startsWith('\uFEFF');
    if (bom) content = content.slice(1);
    const crlf = content.includes('\r\n');
    const remainder = content.replaceAll('\r\n', '');
    const mixed = remainder.includes('\r') || (crlf && remainder.includes('\n'));
    const revision = crypto.createHash('sha256').update(root).update(full)
      .update(String(after.dev) + ':' + String(after.ino) + ':' + String(after.mtimeNs))
      .update(data).digest('hex');
    let writable = (Number(after.mode) & 0o222) !== 0;
    try { await fs.access(full, constants.W_OK); } catch { writable = false; }
    return { content, revision, bom, eol: mixed ? 'mixed' : crlf ? 'crlf' : 'lf',
      readOnly: policyReadOnly || !writable || mixed, mode: Number(after.mode), uid: Number(after.uid), gid: Number(after.gid) };
  } finally { await handle.close(); }
}

/** Describes links without traversing their children or hiding broken targets. */
async function describeEntry(item, request, full) {
  if (!item.isSymbolicLink()) {
    return { name: item.name, kind: item.isDirectory() ? 'directory' : item.isFile() ? 'file' : 'other' };
  }
  const entry = { name: item.name, kind: 'symlink' };
  try {
    entry.linkTarget = await fs.readlink(path.join(full, item.name));
    const relative = [request.target.path, item.name].filter(Boolean).join('/');
    const resolved = await inspectAccess({ ...request.target, path: relative }, request.permissions);
    entry.linkAccess = resolved.linkAccess;
    if (resolved.linkAccess.access === 'denied') entry.linkError = 'accessDenied';
    const metadata = await fs.stat(resolved.full);
    entry.kind = metadata.isDirectory() ? 'directory' : metadata.isFile() ? 'file' : 'other';
  } catch (error) {
    entry.linkError = error.fileCode || (error.code === 'ELOOP' ? 'symlink' : 'inaccessible');
  }
  return entry;
}

/** Performs one bounded list/read/check/save operation. */
async function execute(request) {
  if (request.type === 'workspaceFiles.linkAccess') {
    return (await inspectAccess(request.target, request.permissions)).linkAccess;
  }
  const { full, root, readOnly } = await resolveTarget(request.target, request.permissions);
  if (request.type === 'workspaceFiles.save' && readOnly) fail('readOnly', 'External access is read-only.');
  if (request.type === 'workspaceFiles.stat') {
    const metadata = await fs.stat(full);
    let writable = (metadata.mode & 0o222) !== 0;
    try { await fs.access(full, constants.W_OK); } catch { writable = false; }
    return { kind: metadata.isDirectory() ? 'directory' : metadata.isFile() ? 'file' : 'other',
      readOnly: readOnly || !writable };
  }
  if (request.type === 'workspaceFiles.list') {
    const directory = await fs.opendir(full);
    const entries = [];
    for await (const item of directory) {
      if (entries.length >= 10000) fail('tooLarge', 'Directory contains more than 10,000 entries.');
      entries.push(await describeEntry(item, request, full));
    }
    entries.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return entries;
  }
  const current = await readSnapshot(full, root, readOnly);
  if (request.type === 'workspaceFiles.check') return current.revision === request.revision;
  if (request.type === 'workspaceFiles.read') return current;
  if (request.type !== 'workspaceFiles.save') fail('invalidPath', 'Unknown file operation.');
  if (current.revision !== request.revision) fail('conflict', 'The file changed on disk. Reload before saving.');
  if (current.readOnly) fail('readOnly', 'File is read-only or has mixed line endings.');
  if (request.bom !== current.bom || typeof request.content !== 'string') {
    fail('encoding', 'The original file encoding must be preserved.');
  }
  const content = request.content.replace(/\r\n|\r|\n/g, current.eol === 'crlf' ? '\r\n' : '\n');
  const data = Buffer.from((current.bom ? '\uFEFF' : '') + content, 'utf8');
  if (data.length > MAX_BYTES) fail('tooLarge', 'Maximum supported size: 2 MiB.');
  const temporary = path.join(path.dirname(full), '.opencodex-save-' + crypto.randomUUID());
  try {
    const handle = await fs.open(temporary, 'wx', current.mode & 0o777);
    try {
      await handle.writeFile(data);
      if (process.platform !== 'win32') {
        const metadata = await handle.stat();
        if (metadata.uid !== current.uid || metadata.gid !== current.gid) {
          await handle.chown(current.uid, current.gid);
        }
        await handle.chmod(current.mode & 0o777);
      }
      await handle.sync();
    } finally { await handle.close(); }
    const latestTarget = await resolveTarget(request.target, request.permissions);
    if (latestTarget.full !== full || latestTarget.root !== root ||
        (await readSnapshot(full, root, readOnly)).revision !== current.revision) {
      fail('conflict', 'File changed before the save could complete.');
    }
    await fs.rename(temporary, full);
    return await readSnapshot(full, root, readOnly);
  } finally { await fs.rm(temporary, { force: true }); }
}

/** Serializes expected and native failures without disclosing file contents. */
async function respond(request) {
  try { return { ok: true, value: await execute(request) }; }
  catch (error) {
    return { ok: false, code: error.fileCode || (error.code === 'ELOOP' ? 'symlink' : 'inaccessible'), details: error.message };
  }
}

if (parentPort) {
  respond(workerData).then(result => parentPort.postMessage(result));
} else {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    input += chunk;
    if (input.length > MAX_BYTES * 8) process.exit(1);
  });
  process.stdin.on('end', async () => {
    try { process.stdout.write(JSON.stringify(await respond(JSON.parse(input)))); }
    catch (error) { process.stderr.write(String(error)); process.exitCode = 1; }
  });
}
`;
