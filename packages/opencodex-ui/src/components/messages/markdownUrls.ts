import { defaultUrlTransform } from "react-markdown";
import { parseFileLink } from "../../stores/files/fileLinkTarget";

/** Allows isolated image data URLs while continuing to reject executable URL schemes. */
export function isImageDataUrl(url: string): boolean {
  return /^data:image\/(?:png|jpeg|gif|webp|bmp|avif|x-icon|svg\+xml);base64,[a-z0-9+/=\r\n]+$/i.test(url);
}

/** Preserves source file references for application handlers, never for browser navigation. */
export function transformMarkdownUrl(url: string, key: string): string {
  if (/^(?:file:|[a-z]:[\\/])/i.test(url) && parseFileLink(url) !== null) return url;
  if (key === "src" && isImageDataUrl(url)) return url;
  return defaultUrlTransform(url);
}

/** Identifies image bytes or web resources that can be displayed without filesystem access. */
export function readDisplayImageUrl(url: string): string | null {
  if (isImageDataUrl(url) || /^https?:\/\//i.test(url)) return url;
  return null;
}

/** Decodes a local Markdown image reference using source path syntax. */
export function readMarkdownImagePath(url: string): string | null {
  const target = parseFileLink(url);
  if (target === null) return null;
  if (/^file:/i.test(url)) return target.path;
  try {
    return decodeURIComponent(target.path);
  } catch {
    return null;
  }
}
