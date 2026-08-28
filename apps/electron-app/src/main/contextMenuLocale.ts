/**
 * Provides localized labels for the native editing context menu.
 */
import type { OpenCodexLanguage } from "@open-codex-ui/opencodex-protocol";

/** Roles used by the editing context menu. */
export type ContextMenuActionRole =
  | "undo"
  | "redo"
  | "cut"
  | "copy"
  | "paste"
  | "delete"
  | "selectAll";

/** Languages supported by the OpenCodexUI context menu. */
export type ContextMenuLanguage = Exclude<OpenCodexLanguage, "system">;

/** Localized labels for editing actions. */
export type ContextMenuLabels = Record<ContextMenuActionRole, string>;

const contextMenuLabels = {
  fr: {
    undo: "Annuler",
    redo: "Rétablir",
    cut: "Couper",
    copy: "Copier",
    paste: "Coller",
    delete: "Supprimer",
    selectAll: "Tout sélectionner"
  },
  en: {
    undo: "Undo",
    redo: "Redo",
    cut: "Cut",
    copy: "Copy",
    paste: "Paste",
    delete: "Delete",
    selectAll: "Select all"
  }
} as const satisfies Record<ContextMenuLanguage, ContextMenuLabels>;

/**
 * Resolves the context-menu language from the configured application language.
 *
 * @param language Persisted OpenCodexUI language setting.
 * @param systemLocale Electron locale used when the setting follows the system.
 * @returns Effective context-menu language.
 */
export function resolveContextMenuLanguage(
  language: OpenCodexLanguage,
  systemLocale: string
): ContextMenuLanguage {
  if (language === "fr" || language === "en") {
    return language;
  }

  return systemLocale.toLowerCase().startsWith("en") ? "en" : "fr";
}

/**
 * Reads labels for one effective context-menu language.
 *
 * @param language Effective context-menu language.
 * @returns Labels used by the native menu items.
 */
export function getContextMenuLabels(language: ContextMenuLanguage): ContextMenuLabels {
  return contextMenuLabels[language];
}
