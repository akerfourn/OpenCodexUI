import { readFile } from "node:fs/promises";

import type {
  OpenCodexCommitMessageLanguage
} from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexStagedCommitContext } from "./GitService.js";

type CommitMessageGenerationPromptParams = {
  template: string;
  prompt: string;
  stagedContext: OpenCodexStagedCommitContext;
  instruction: string;
  language: OpenCodexCommitMessageLanguage;
};

export function buildCommitMessageGenerationPrompt(
  params: CommitMessageGenerationPromptParams
): string {
  const language = params.language === "fr" ? "French" : "English";
  const trimmedInstruction = params.instruction.trim();
  const diffCompleteness = params.stagedContext.isDiffTruncated ? "truncated" : "complete";

  const replacements: Record<string, string> = {
    "##LANG##": language,
    "##EXTRA_PROMPT##": trimmedInstruction,
    "##DIFF_COMPLETENESS##": diffCompleteness,
    "##STAGED_STAT##": fence(params.stagedContext.stat),
    "##STAGED_STATUS##": fence(params.stagedContext.nameStatus),
    "##STAGED_DIFF##": fence(params.stagedContext.diff)
  };

  let prompt = params.template;

  for (const [token, value] of Object.entries(replacements)) {
    prompt = prompt.split(token).join(value);
  }

  return prompt.split("##USER_PROMPT##").join(params.prompt);
}

export async function readRequiredPromptFile(
  promptPath: string | undefined,
  label: string
): Promise<string> {
  if (promptPath === undefined) {
    throw new Error(`Missing ${label} path.`);
  }

  try {
    return await readFile(promptPath, "utf8");
  } catch (error) {
    throw new Error(`Unable to read ${label} at ${promptPath}: ${String(error)}`);
  }
}

function fence(value: string): string {
  return `\`\`\`\n${value.trim()}\n\`\`\``;
}
