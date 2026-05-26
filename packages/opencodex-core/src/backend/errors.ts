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

export function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

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

export function isMissingRolloutError(error: unknown): boolean {
  return error instanceof JsonRpcError && error.message.includes("no rollout found for thread id");
}

export function isUnmaterializedThreadError(error: unknown): boolean {
  return (
    error instanceof JsonRpcError &&
    error.message.includes("is not materialized yet") &&
    error.message.includes("thread/turns/list")
  );
}
