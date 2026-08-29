/**
 * Builds the localized native confirmation dialog used before application shutdown.
 */
import type { MessageBoxOptions } from "electron";

import type { ContextMenuLanguage } from "./contextMenuLocale.js";

/**
 * Creates the native dialog configuration for one shutdown context.
 *
 * @param language Effective application language.
 * @param hasActiveTurns Whether at least one Codex turn is still running.
 * @returns Localized native message-box options.
 */
export function buildAppCloseConfirmationOptions(
  language: ContextMenuLanguage,
  hasActiveTurns: boolean
): MessageBoxOptions {
  if (language === "en") {
    return {
      type: hasActiveTurns ? "warning" : "question",
      title: "Quit OpenCodexUI?",
      message: hasActiveTurns
        ? "One or more Codex turns are still running."
        : "Are you sure you want to quit OpenCodexUI?",
      detail: hasActiveTurns
        ? "Quitting now will interrupt the work in progress."
        : "Codex processes will be stopped.",
      buttons: [hasActiveTurns ? "Quit anyway" : "Quit", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    };
  }

  return {
    type: hasActiveTurns ? "warning" : "question",
    title: "Quitter OpenCodexUI ?",
    message: hasActiveTurns
      ? "Un ou plusieurs tours Codex sont encore en cours."
      : "Voulez-vous vraiment quitter OpenCodexUI ?",
    detail: hasActiveTurns
      ? "Quitter maintenant interrompra le travail en cours."
      : "Les processus Codex seront arrêtés.",
    buttons: [hasActiveTurns ? "Quitter malgré tout" : "Quitter", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  };
}
