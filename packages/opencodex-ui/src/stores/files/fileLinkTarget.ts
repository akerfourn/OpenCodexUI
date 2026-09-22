/** A source path with optional editor navigation, independent of the host operating system. */
export interface FileLinkLocation {
  path: string;
  line?: number;
  column?: number;
}

/** Separates file links from web/application URLs without interpreting Windows drives as schemes. */
export function parseFileLink(href: string): FileLinkLocation | null {
  let path = href.trim();
  if (path.length === 0) return null;
  const location = /(?:#L(\d+)(?:C(\d+))?(?:-L\d+(?:C\d+)?)?|:(\d+)(?::(\d+))?)$/i.exec(path);
  let line: number | undefined;
  let column: number | undefined;
  if (location !== null) {
    line = Number(location[1] ?? location[3]);
    const value = location[2] ?? location[4];
    if (value !== undefined) column = Number(value);
    path = path.slice(0, location.index);
  }
  if (/^file:/i.test(path)) {
    try {
      const url = new URL(path);
      path = decodeURIComponent(url.pathname);
      if (url.hostname !== "" && url.hostname !== "localhost") path = `//${url.hostname}${path}`;
      else if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    } catch { return null; }
  } else if (!/^[A-Za-z]:[\\/]/.test(path) && /^[A-Za-z][A-Za-z\d+.-]*:/.test(path)) {
    return null;
  }
  return { path, line, column };
}

/** Converts a contained source path to the relative path required by workspace file access. */
export function relativeWorkspacePath(path: string, root: string): string | null {
  const windows = /^[A-Za-z]:[\\/]|^[\\/]{2}/.test(root);
  const normalize = (value: string): string => windows ? value.replaceAll("\\", "/") : value;
  const base = normalize(root).replace(/\/+$/, "");
  let value = normalize(path);
  const absolute = value.startsWith("/") || /^[A-Za-z]:/.test(value);
  if (absolute) {
    const comparable = windows ? value.toLowerCase() : value;
    const prefix = `${windows ? base.toLowerCase() : base}/`;
    if (!comparable.startsWith(prefix)) return null;
    value = value.slice(prefix.length);
  }
  const parts: string[] = [];
  for (const part of value.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else parts.push(part);
  }
  if (parts.length === 0 || parts.some(part => part.includes("\0"))) return null;
  return parts.join("/");
}
