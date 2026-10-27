import { parseFileLink } from "../../stores/files/fileLinkTarget";

/** Removes navigation suffixes and resolves document-relative links without using host path semantics. */
export function fileLinkFolderHref(href: string, documentPath?: string): string | null {
  let reference = href.trim();
  if (reference.startsWith("#")) return null;
  if (documentPath !== undefined && !/^file:/i.test(reference)) reference = reference.split("#")[0]!;
  const location = parseFileLink(reference);
  if (location === null) return null;
  let path = location.path;
  if (documentPath !== undefined && !/^file:/i.test(reference)) {
    try { path = decodeURIComponent(path); }
    catch { return null; }
  }
  if (documentPath === undefined || /^[\\/]|^[A-Za-z]:[\\/]/.test(path)) return path;
  const directory = documentPath.split("/").slice(0, -1).join("/");
  if (directory.length === 0) return path;
  return `${directory}/${path}`;
}
