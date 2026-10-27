import { useContext, type MouseEvent, type ReactNode } from "react";
import { parseFileLink } from "../../stores/files/fileLinkTarget";
import { FileLinkMenuContext } from "./FileLinkMenuContext";
import { fileLinkFolderHref } from "./fileLinkFolderHref";

/** Delegates file-link context menus within one explicit source, including React portals. */
export function FileLinkScope({ sourceId, projectPath, documentPath, children }: {
  sourceId: string | null;
  projectPath: string | null;
  documentPath?: string;
  children: ReactNode;
}) {
  const actions = useContext(FileLinkMenuContext);

  /** Leaves web URLs, skills, anchors and existing context menus untouched. */
  function handleContextMenu(event: MouseEvent<HTMLDivElement>): void {
    if (event.defaultPrevented || actions === null || !(event.target instanceof Element)) return;
    const link = event.target.closest("a[href], [data-file-link]");
    const href = link?.getAttribute("data-file-link") ?? link?.getAttribute("href");
    if (href === undefined || href === null || href.startsWith("#") || parseFileLink(href) === null) return;
    event.preventDefault();
    event.stopPropagation();
    actions.show({ href, folderHref: fileLinkFolderHref(href, documentPath), sourceId, projectPath },
      { left: event.clientX, top: event.clientY });
  }

  return <div style={{ display: "contents" }} onContextMenu={handleContextMenu}>{children}</div>;
}
