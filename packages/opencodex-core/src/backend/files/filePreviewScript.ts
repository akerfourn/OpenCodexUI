/** Shared source-side media detection and bounded HTML asset reads, under normal workspace permissions. */
export const filePreviewScript = String.raw`
/** Detects audio containers supported by Chromium; decoding remains the media element's responsibility. */
function audioMimeType(header, full) {
  const extension = path.extname(full).toLowerCase();
  const types = { '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.oga': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4',
    '.aac': 'audio/aac', '.weba': 'audio/webm', '.webm': 'audio/webm', '.aif': 'audio/aiff', '.aiff': 'audio/aiff' };
  if (!types[extension]) return null;
  const text = header.toString('latin1');
  const recognized = text.startsWith('ID3') || (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)
    || (text.startsWith('RIFF') && text.slice(8, 12) === 'WAVE') || text.startsWith('OggS')
    || text.startsWith('fLaC') || text.slice(4, 8) === 'ftyp'
    || header.subarray(0, 4).toString('hex') === '1a45dfa3'
    || (text.startsWith('FORM') && ['AIFF', 'AIFC'].includes(text.slice(8, 12)));
  return recognized ? types[extension] : null;
}

/** Allows only web asset formats, never directory listings or unrestricted file downloads. */
async function readPreviewAsset(full) {
  const mimeTypes = { '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.ico': 'image/x-icon',
    '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.oga': 'audio/ogg',
    '.opus': 'audio/ogg', '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.weba': 'audio/webm', '.webm': 'audio/webm',
    '.aif': 'audio/aiff', '.aiff': 'audio/aiff' };
  const mimeType = mimeTypes[path.extname(full).toLowerCase()];
  if (!mimeType) fail('unsupported', 'This file type cannot be served in an HTML preview.');
  const handle = await fs.open(full, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat({ bigint: true });
    if (!before.isFile()) fail('unsupported', 'Only regular preview assets can be opened.');
    if (before.size > BigInt(MAX_IMAGE_BYTES)) fail('tooLarge', 'Maximum supported preview asset size: 10 MiB.');
    const buffer = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    let length = 0;
    while (length < buffer.length) {
      const next = await handle.read(buffer, length, buffer.length - length, null);
      if (next.bytesRead === 0) break;
      length += next.bytesRead;
    }
    if (length > MAX_IMAGE_BYTES) fail('tooLarge', 'Maximum supported preview asset size: 10 MiB.');
    const after = await handle.stat({ bigint: true });
    if (before.mtimeNs !== after.mtimeNs || before.size !== after.size) fail('conflict', 'Preview asset changed while reading.');
    return { dataBase64: buffer.subarray(0, length).toString('base64'), byteLength: length, mimeType };
  } finally { await handle.close(); }
}
`;
