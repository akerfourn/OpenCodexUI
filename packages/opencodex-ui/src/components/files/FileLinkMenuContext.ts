import { createContext } from "react";

/** A clicked reference retains its source and base directory while the menu is open. */
export interface FileLinkMenuTarget {
  href: string;
  folderHref: string | null;
  sourceId: string | null;
  projectPath: string | null;
}

/** Shares one menu and host actions across links, portals and the file explorer. */
export interface FileLinkMenuActions {
  show(target: FileLinkMenuTarget, anchor: { left: number; top: number }): void;
  canOpenFolder(target: FileLinkMenuTarget): boolean;
  openFolder(target: FileLinkMenuTarget): void;
  copyLink(href: string): void;
}

export const FileLinkMenuContext = createContext<FileLinkMenuActions | null>(null);
