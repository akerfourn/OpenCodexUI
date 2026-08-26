/**
 * Normalizes backend errors and localized labels.
 */
import {
  CodexProcessError,
  JsonRpcError
} from "@open-codex-ui/codex-rpc";
import type { OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";

export type BackendLabels = {
  approvalUnavailable: string;
  codexCommandHelp: string;
  codexRejectedRequest: string;
  missingLinkHandler: string;
};

/**
 * Converts unknown backend failures into localized user-facing errors.
 *
 * @param error Raw failure.
 * @param labels Localized backend labels.
 * @returns Serializable normalized error payload with an optional detail value.
 */
export function normalizeError(
  error: unknown,
  language: OpenCodexSettings["language"] = "fr"
): { message: string; details?: unknown } {
  const labels = getBackendLabels(language);

  if (error instanceof CodexProcessError) {
    return {
      message: error.message,
      details: labels.codexCommandHelp
    };
  }

  if (error instanceof JsonRpcError) {
    return {
      message: `${labels.codexRejectedRequest}: ${error.message}`,
      details: error.data
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      details: error.stack
    };
  }

  return { message: String(error) };
}

/**
 * Normalizes an unknown thrown value into an Error instance.
 *
 * @param error Raw thrown value.
 * @returns Error instance preserving the original message when possible.
 */
export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Reads localized backend labels for a UI language.
 *
 * @param language Configured UI language.
 * @returns Labels used by backend error messages.
 */
export function getBackendLabels(language: OpenCodexSettings["language"]): BackendLabels {
  if (language === "en") {
    return {
      approvalUnavailable: "The approval request is no longer available.",
      codexCommandHelp: "Check that Codex CLI is installed and that codexCommand points to the right executable.",
      codexRejectedRequest: "Codex app-server rejected the request",
      missingLinkHandler: "No external link opener is configured."
    };
  }

  return {
    approvalUnavailable: "La demande d'approbation n'est plus disponible.",
    codexCommandHelp: "Vérifiez que Codex CLI est installé et que codexCommand pointe vers le bon exécutable.",
    codexRejectedRequest: "Codex app-server a refusé la requête",
    missingLinkHandler: "Aucun gestionnaire d'ouverture de lien externe n'est configuré."
  };
}

/**
 * Checks whether a failure means a cached thread no longer has a Codex rollout.
 *
 * @param error Raw failure.
 * @returns True when the error can be handled by forgetting the cached thread.
 */
export function isMissingRolloutError(error: unknown): boolean {
  return error instanceof JsonRpcError && error.message.includes("no rollout found for thread id");
}

/**
 * Checks whether a failure means a thread has not received its first turn yet.
 *
 * @param error Raw failure.
 * @returns True when the thread can be treated as not yet materialized.
 */
export function isUnmaterializedThreadError(error: unknown): boolean {
  return (
    error instanceof JsonRpcError &&
    error.message.includes("is not materialized yet") &&
    error.message.includes("thread/turns/list")
  );
}
