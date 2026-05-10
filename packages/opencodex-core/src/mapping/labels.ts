/**
 * Localized labels used by core payload mapping.
 */
import type { OpenCodexLanguage } from "@open-codex-ui/opencodex-protocol";

export type CoreLabels = {
  approvalRequired: string;
  collabAgent: string;
  command: string;
  contextCompaction: string;
  dynamicTool: string;
  enteredReviewMode: string;
  exitedReviewMode: string;
  fileChange: string;
  imageGeneration: string;
  inProgress: string;
  mcpTool: string;
  permissionsRequested: string;
  webSearch: string;
};

export function getCoreLabels(language: OpenCodexLanguage): CoreLabels {
  if (language === "en") {
    return {
      approvalRequired: "approval required",
      collabAgent: "Collaborative agent",
      command: "Command",
      contextCompaction: "Context compaction",
      dynamicTool: "Dynamic tool",
      enteredReviewMode: "Entered review mode",
      exitedReviewMode: "Exited review mode",
      fileChange: "File change",
      imageGeneration: "Image generation",
      inProgress: "in progress",
      mcpTool: "MCP tool",
      permissionsRequested: "Additional permissions requested",
      webSearch: "Web search"
    };
  }

  return {
    approvalRequired: "approbation requise",
    collabAgent: "Agent collaboratif",
    command: "Commande",
    contextCompaction: "Compactage du contexte",
    dynamicTool: "Outil dynamique",
    enteredReviewMode: "EntrÃ©e en mode revue",
    exitedReviewMode: "Sortie du mode revue",
    fileChange: "Modification fichier",
    imageGeneration: "GÃ©nÃ©ration image",
    inProgress: "en cours",
    mcpTool: "Outil MCP",
    permissionsRequested: "Permissions supplÃ©mentaires demandÃ©es",
    webSearch: "Recherche web"
  };
}

