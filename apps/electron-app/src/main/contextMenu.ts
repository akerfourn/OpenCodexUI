/**
 * Provides native editing and spelling context menus for Electron windows.
 */
import { Menu, type BrowserWindow } from "electron";

import { getContextMenuIcon } from "./contextMenuIcons.js";
import type { ContextMenuLanguage } from "./contextMenuLocale.js";
import { buildContextMenuTemplate } from "./contextMenuTemplate.js";

type ContextMenuState = {
  language: ContextMenuLanguage;
};

const contextMenuStates = new WeakMap<BrowserWindow, ContextMenuState>();

/**
 * Registers the native context menu used by one renderer window.
 *
 * Electron does not provide a default context menu. This handler keeps editing
 * actions available for both native form controls and the Lexical composer.
 *
 * @param window Browser window receiving context-menu events.
 * @param language Effective language used for action labels.
 * @returns Nothing.
 */
export function registerContextMenu(
  window: BrowserWindow,
  language: ContextMenuLanguage = "fr"
): void {
  const state: ContextMenuState = { language };
  contextMenuStates.set(window, state);

  window.webContents.on("context-menu", (_event, params) => {
    const template = buildContextMenuTemplate(params, window.webContents, {
      language: state.language,
      iconForRole: getContextMenuIcon
    });

    if (template.length === 0 || window.isDestroyed()) {
      return;
    }

    Menu.buildFromTemplate(template).popup({
      sourceType: params.menuSourceType,
      window
    });
  });
}

/**
 * Updates the language used by a registered window's future context menus.
 *
 * @param window Browser window whose context menu should be updated.
 * @param language Effective OpenCodexUI language.
 * @returns Nothing.
 */
export function setContextMenuLanguage(
  window: BrowserWindow,
  language: ContextMenuLanguage
): void {
  const state = contextMenuStates.get(window);

  if (state !== undefined) {
    state.language = language;
  }
}
