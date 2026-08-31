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
 * @param hasPendingProjectActivity Whether a project tool reports pending activity.
 * @returns Localized native message-box options.
 */
export function buildAppCloseConfirmationOptions(
  language: ContextMenuLanguage,
  hasActiveTurns: boolean,
  hasPendingProjectActivity = false
): MessageBoxOptions {
  const hasPendingWork = hasActiveTurns || hasPendingProjectActivity;
  const message = buildCloseMessage(language, hasActiveTurns, hasPendingProjectActivity);
  const detail = buildCloseDetail(language, hasActiveTurns, hasPendingProjectActivity);
  const quitLabel = language === "en"
    ? hasPendingWork ? "Quit anyway" : "Quit"
    : hasPendingWork ? "Quitter malgré tout" : "Quitter";
  const cancelLabel = language === "en" ? "Cancel" : "Annuler";

  if (language === "en") {
    return {
      type: hasPendingWork ? "warning" : "question",
      title: "Quit OpenCodexUI?",
      message,
      detail,
      buttons: [quitLabel, cancelLabel],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    };
  }

  return {
    type: hasPendingWork ? "warning" : "question",
    title: "Quitter OpenCodexUI ?",
    message,
    detail,
    buttons: [quitLabel, cancelLabel],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  };
}

/** Builds the localized summary of work that may still be pending. */
function buildCloseMessage(
  language: ContextMenuLanguage,
  hasActiveTurns: boolean,
  hasPendingProjectActivity: boolean
): string {
  if (language === "en") {
    if (hasActiveTurns && hasPendingProjectActivity) {
      return "Codex turns and project activity are still running or pending.";
    }

    if (hasActiveTurns) {
      return "One or more Codex turns are still running.";
    }

    if (hasPendingProjectActivity) {
      return "Project activity is still running or pending.";
    }

    return "Are you sure you want to quit OpenCodexUI?";
  }

  if (hasActiveTurns && hasPendingProjectActivity) {
    return "Des tours Codex et des activités de projet sont encore en cours ou en attente.";
  }

  if (hasActiveTurns) {
    return "Un ou plusieurs tours Codex sont encore en cours.";
  }

  if (hasPendingProjectActivity) {
    return "Des activités de projet sont encore en cours ou en attente.";
  }

  return "Voulez-vous vraiment quitter OpenCodexUI ?";
}

/** Builds the localized warning detail for the current shutdown state. */
function buildCloseDetail(
  language: ContextMenuLanguage,
  hasActiveTurns: boolean,
  hasPendingProjectActivity: boolean
): string {
  if (language === "en") {
    if (hasActiveTurns && hasPendingProjectActivity) {
      return "Quitting now may interrupt or leave project work unfinished.";
    }

    if (hasActiveTurns) {
      return "Quitting now will interrupt the work in progress.";
    }

    if (hasPendingProjectActivity) {
      return "Quitting now may leave project work unfinished.";
    }

    return "Codex processes will be stopped.";
  }

  if (hasActiveTurns && hasPendingProjectActivity) {
    return "Quitter maintenant peut interrompre ou laisser un travail de projet inachevé.";
  }

  if (hasActiveTurns) {
    return "Quitter maintenant interrompra le travail en cours.";
  }

  if (hasPendingProjectActivity) {
    return "Quitter maintenant peut laisser un travail de projet inachevé.";
  }

  return "Les processus Codex seront arrêtés.";
}
