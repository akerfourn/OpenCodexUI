/**
 * Creates and caches the small native icons used by the editing context menu.
 */
import { nativeImage } from "electron";
import type { NativeImage } from "electron";

import type { ContextMenuActionRole } from "./contextMenuLocale.js";

const ICON_COLOR = "#64748b";

const iconPaths: Record<ContextMenuActionRole, string> = {
  undo: [
    '<path d="M6 5 2.5 8.5 6 12"/>',
    '<path d="M3 8.5h6.5a4.5 4.5 0 0 1 4.5 4.5"/>'
  ].join(""),
  redo: [
    '<path d="m10 5 3.5 3.5L10 12"/>',
    '<path d="M13 8.5H6.5A4.5 4.5 0 0 0 2 13"/>'
  ].join(""),
  cut: [
    '<circle cx="5" cy="5" r="2"/>',
    '<circle cx="5" cy="11" r="2"/>',
    '<path d="m6.5 6.5 7 7M6.5 9.5l7-7"/>'
  ].join(""),
  copy: [
    '<rect x="5" y="5" width="8" height="8" rx="1"/>',
    '<path d="M3 10V3.75A.75.75 0 0 1 3.75 3H10"/>'
  ].join(""),
  paste: [
    '<path d="M6 4h4"/>',
    '<path d="M6 3h4a1 1 0 0 1 1 1v1h1.25A.75.75 0 0 1 13 5.75v8.5a.75.75 0 0 1-.75.75h-8.5A.75.75 0 0 1 3 14.25v-8.5A.75.75 0 0 1 3.75 5H5V4a1 1 0 0 1 1-1Z"/>'
  ].join(""),
  delete: [
    '<path d="M3 5h10M6 5V3h4v2M5 7v5M8 7v5M11 7v5"/>',
    '<path d="m4 5 .5 9h7L12 5"/>'
  ].join(""),
  selectAll: [
    '<rect x="3" y="3" width="10" height="10" rx="1"/>',
    '<path d="M6 3V1.75M10 3V1.75M6 13v1.25M10 13v1.25M3 6H1.75M3 10H1.75M13 6h1.25M13 10h1.25"/>'
  ].join("")
};

const iconsByRole = new Map<ContextMenuActionRole, NativeImage>();

/**
 * Returns a cached native icon for one editing action.
 *
 * @param role Editing role represented by the icon.
 * @returns Native image suitable for an Electron menu item.
 */
export function getContextMenuIcon(role: ContextMenuActionRole): NativeImage {
  const existingIcon = iconsByRole.get(role);

  if (existingIcon !== undefined) {
    return existingIcon;
  }

  const icon = createContextMenuIcon(iconPaths[role]);
  iconsByRole.set(role, icon);
  return icon;
}

/**
 * Builds one monochrome SVG image at the size expected by native menus.
 *
 * @param path SVG path and shape elements describing the icon.
 * @returns Native image decoded from the SVG data URL.
 */
function createContextMenuIcon(path: string): NativeImage {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"',
    `fill="none" stroke="${ICON_COLOR}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">`,
    path,
    "</svg>"
  ].join("");

  return nativeImage.createFromDataURL(
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  );
}
