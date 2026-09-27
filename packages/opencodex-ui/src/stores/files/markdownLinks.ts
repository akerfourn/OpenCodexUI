import type { OpenCodexFileTarget } from "@open-codex-ui/opencodex-protocol";
import type { FileDocument, FileRequestPort, DocumentPosition } from "./FileDocument";
import type { ProjectFilesStore } from "./ProjectFilesStore";
import { parseFileLink, relativeWorkspacePath } from "./fileLinkTarget";

export type MarkdownLinkTarget =
  | { kind: "external"; href: string }
  | { kind: "anchor"; anchor: string }
  | { kind: "file"; target: OpenCodexFileTarget; position?: DocumentPosition; anchor?: string };

/** Resolves Markdown URLs in the document's source filesystem, never the Electron host. */
export function resolveMarkdownLink(href: string, target: Readonly<OpenCodexFileTarget> | null): MarkdownLinkTarget {
  const value = href.trim();
  if (/^(https?:\/\/|mailto:)/i.test(value)) return { kind: "external", href: value };
  if (value.startsWith("#")) return { kind: "anchor", anchor: decodeURIComponent(value.slice(1)) };
  if (target === null) throw new Error("This document has no filesystem context.");
  const hash = value.indexOf("#");
  const fragment = hash < 0 ? undefined : decodeURIComponent(value.slice(hash + 1));
  const source = hash < 0 ? value : value.slice(0, hash);
  const location = parseFileLink(source);
  if (location === null) throw new Error("Unsupported link protocol.");
  const path = /^file:/i.test(source) ? location.path : decodeURIComponent(location.path);
  const absolute = /^[\\/]|^[A-Za-z]:[\\/]/.test(path);
  const directory = target.path.split("/").slice(0, -1).join("/");
  const relativePath = directory.length === 0 ? path : `${directory}/${path}`;
  const relative = relativeWorkspacePath(absolute ? path : relativePath, target.workspacePath);
  if (relative === null) throw new Error("The link is outside the document workspace.");
  const lineFragment = fragment === undefined ? null : /^L(\d+)(?:C(\d+))?(?:-L\d+)?$/i.exec(fragment);
  let position: DocumentPosition | undefined;
  if (lineFragment !== null) {
    position = { line: Number(lineFragment[1]), column: Number(lineFragment[2] ?? 1) };
  } else if (location.line !== undefined) {
    position = { line: location.line, column: location.column };
  }
  return { kind: "file", target: { ...target, path: relative }, position,
    anchor: position === undefined ? fragment : undefined };
}

/** Opens links on the original workspace even if the project selection has changed. */
export async function openMarkdownLink(
  href: string, document: FileDocument, files: ProjectFilesStore, port: FileRequestPort, externalFile = false
): Promise<void> {
  const link = resolveMarkdownLink(href, document.target);
  if (link.kind === "external") {
    await port.request({ type: "system.openLink", href: link.href,
      projectPath: document.target?.workspacePath ?? null, sourceId: document.target?.sourceId ?? null });
    return;
  }
  if (link.kind === "anchor") {
    const line = /^L(\d+)(?:C(\d+))?(?:-L\d+)?$/i.exec(link.anchor);
    if (line !== null) {
      document.navigateTo({ line: Number(line[1]), column: Number(line[2] ?? 1) });
      return;
    }
    document.navigateToHeading(link.anchor);
    return;
  }
  if (externalFile) {
    await port.request({ type: "system.openLink", href: link.target.path,
      projectPath: link.target.workspacePath, sourceId: link.target.sourceId, workspaceId: link.target.workspaceId });
    return;
  }
  await files.open(link.target, document.workspaceName, link.position,
    { origin: "link", markdownAnchor: link.anchor });
}
