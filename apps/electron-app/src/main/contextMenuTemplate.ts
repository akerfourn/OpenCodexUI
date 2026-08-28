/**
 * Builds native editing and spelling context-menu entries.
 */
import type { ContextMenuParams, MenuItemConstructorOptions, WebContents } from "electron";

import {
  getContextMenuLabels,
  type ContextMenuActionRole,
  type ContextMenuLanguage,
  type ContextMenuLabels
} from "./contextMenuLocale.js";

type ContextMenuContents = Pick<WebContents, "isDestroyed" | "replaceMisspelling">;

/** Optional presentation settings for the native context menu. */
export type ContextMenuTemplateOptions = {
  language?: ContextMenuLanguage;
  iconForRole?: (role: ContextMenuActionRole) => MenuItemConstructorOptions["icon"];
};

/**
 * Builds context-menu entries from Chromium's editability and spelling state.
 *
 * @param params Context information reported by Electron.
 * @param contents Web contents receiving spelling commands.
 * @param options Optional language and icon configuration.
 * @returns Native menu template, or an empty template when nothing is actionable.
 */
export function buildContextMenuTemplate(
  params: Pick<
    ContextMenuParams,
    "dictionarySuggestions" | "editFlags" | "isEditable" | "misspelledWord" | "selectionText"
  >,
  contents: ContextMenuContents,
  options: ContextMenuTemplateOptions = {}
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];
  const spellingSuggestions = readSpellingSuggestions(params);
  const labels = getContextMenuLabels(options.language ?? "fr");

  spellingSuggestions.forEach((suggestion) => {
    template.push({
      label: suggestion,
      click: () => {
        if (!contents.isDestroyed()) {
          contents.replaceMisspelling(suggestion);
        }
      }
    });
  });

  if (spellingSuggestions.length > 0) {
    appendSeparator(template);
  }

  if (params.isEditable) {
    appendEditableActions(template, params, labels, options.iconForRole);
  } else {
    appendReadOnlyActions(template, params, labels, options.iconForRole);
  }

  return template;
}

/**
 * Adds editing actions for an editable input using Chromium's capability flags.
 *
 * @param template Mutable menu template.
 * @param params Context information reported by Electron.
 */
function appendEditableActions(
  template: MenuItemConstructorOptions[],
  params: Pick<ContextMenuParams, "editFlags">,
  labels: ContextMenuLabels,
  iconForRole: ContextMenuTemplateOptions["iconForRole"]
): void {
  const { editFlags } = params;

  appendMenuItem(template, "undo", editFlags.canUndo, labels, iconForRole);
  appendMenuItem(template, "redo", editFlags.canRedo, labels, iconForRole);
  appendSeparator(template);
  appendMenuItem(template, "cut", editFlags.canCut, labels, iconForRole);
  appendMenuItem(template, "copy", editFlags.canCopy, labels, iconForRole);
  appendMenuItem(template, "paste", editFlags.canPaste, labels, iconForRole);
  appendMenuItem(template, "delete", editFlags.canDelete, labels, iconForRole);
  appendSeparator(template);
  appendMenuItem(template, "selectAll", editFlags.canSelectAll, labels, iconForRole);
}

/**
 * Adds copy and selection actions for a non-editable context.
 *
 * @param template Mutable menu template.
 * @param params Context information reported by Electron.
 */
function appendReadOnlyActions(
  template: MenuItemConstructorOptions[],
  params: Pick<ContextMenuParams, "editFlags" | "selectionText">,
  labels: ContextMenuLabels,
  iconForRole: ContextMenuTemplateOptions["iconForRole"]
): void {
  const { editFlags } = params;

  if (editFlags.canCopy || params.selectionText.length > 0) {
    appendMenuItem(template, "copy", editFlags.canCopy, labels, iconForRole);
  }

  if (editFlags.canSelectAll) {
    appendSeparator(template);
    appendMenuItem(template, "selectAll", true, labels, iconForRole);
  }
}

/**
 * Adds one native role to a context-menu template.
 *
 * @param template Mutable menu template.
 * @param role Electron editing role.
 * @param enabled Whether the renderer currently supports the action.
 */
function appendMenuItem(
  template: MenuItemConstructorOptions[],
  role: ContextMenuActionRole,
  enabled: boolean,
  labels: ContextMenuLabels,
  iconForRole: ContextMenuTemplateOptions["iconForRole"]
): void {
  const item: MenuItemConstructorOptions = {
    enabled,
    label: labels[role],
    role
  };
  const icon = iconForRole?.(role);

  if (icon !== undefined) {
    item.icon = icon;
  }

  template.push(item);
}

/**
 * Adds a separator only when the previous entry is not already a separator.
 *
 * @param template Mutable menu template.
 */
function appendSeparator(template: MenuItemConstructorOptions[]): void {
  if (template.length === 0 || template[template.length - 1]?.type === "separator") {
    return;
  }

  template.push({ type: "separator" });
}

/**
 * Filters invalid and duplicate dictionary suggestions from Chromium's payload.
 *
 * @param params Context information reported by Electron.
 * @returns Unique non-empty spelling suggestions.
 */
function readSpellingSuggestions(
  params: Pick<ContextMenuParams, "dictionarySuggestions" | "misspelledWord">
): string[] {
  if (params.misspelledWord.trim().length === 0) {
    return [];
  }

  return Array.from(new Set(
    params.dictionarySuggestions
      .map((suggestion) => suggestion.trim())
      .filter((suggestion) => suggestion.length > 0)
  ));
}
