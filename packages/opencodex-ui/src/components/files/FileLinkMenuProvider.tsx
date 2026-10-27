import { Menu } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useMemo, useState, type ReactNode } from "react";
import type { RootStore } from "../../stores/RootStore";
import { FileLinkMenuContext, type FileLinkMenuActions, type FileLinkMenuTarget } from "./FileLinkMenuContext";
import { FileLinkMenuItemsX } from "./FileLinkMenuItems";

/** Owns one application-wide link menu; all asynchronous requests use the clicked source snapshot. */
export function FileLinkMenuProvider({ store, children }: { store: RootStore; children: ReactNode }) {
  const [menu, setMenu] = useState<{
    target: FileLinkMenuTarget;
    anchor: { left: number; top: number };
  } | null>(null);
  const actions = useMemo<FileLinkMenuActions>(() => {
    /** Checks the current source capability without converting source paths on the host. */
    function canOpenFolder(target: FileLinkMenuTarget): boolean {
      return target.folderHref !== null && target.sourceId !== null
        && store.sourcesStore.hasLocalAccess(target.sourceId);
    }
    /** Reports both clipboard and host failures through the application's normal feedback. */
    function reportError(error: unknown): void {
      store.appStore.applyError({ type: "error", message: String(error) });
    }
    /** Dispatches only detached strings from the clicked link, never active selections. */
    async function openFolder(target: FileLinkMenuTarget): Promise<void> {
      if (!canOpenFolder(target) || target.folderHref === null) return;
      await store.request({ type: "system.openLinkFolder", href: target.folderHref,
        projectPath: target.projectPath, sourceId: target.sourceId });
    }
    /** Keeps clipboard permission failures inside the same visible error channel. */
    async function copyLink(href: string): Promise<void> {
      await navigator.clipboard.writeText(href);
    }
    return {
      show(target, anchor) { setMenu({ target: { ...target }, anchor: { ...anchor } }); },
      canOpenFolder,
      openFolder(target) { void openFolder(target).catch(reportError); },
      copyLink(href) { void copyLink(href).catch(reportError); }
    };
  }, [store]);

  /** Dismisses the menu without changing the original link or active workspace. */
  function handleClose(): void { setMenu(null); }

  let menuContent = null;
  if (menu !== null) {
    menuContent = <Menu open onClose={handleClose} anchorReference="anchorPosition" anchorPosition={menu.anchor}>
      <FileLinkMenuItemsX target={menu.target} onClose={handleClose} />
    </Menu>;
  }
  return <FileLinkMenuContext.Provider value={actions}>{children}{menuContent}</FileLinkMenuContext.Provider>;
}

export const FileLinkMenuProviderX = observer(FileLinkMenuProvider);
