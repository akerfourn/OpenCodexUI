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

/**
 * Builds the one-shot prompt sent to Codex for commit message generation.
 *
 * @param params Template, user prompt, staged Git context, and output language.
 * @returns Fully substituted generation prompt.
 */
export function buildCommitMessageGenerationPrompt(
  params: CommitMessageGenerationPromptParams
): string {
  const language = params.language === "fr" ? "French" : "English";
  const trimmedInstruction = params.instruction.trim();

  const replacements: Record<string, string> = {
    "##LANG##": language,
    "##EXTRA_PROMPT##": trimmedInstruction,
    "##STAGED_STAT##": fence(params.stagedContext.stat),
    "##STAGED_STATUS##": fence(params.stagedContext.nameStatus),
    "##STAGED_NUMSTAT##": fence(params.stagedContext.numStat)
  };

  let prompt = params.template;

  for (const [token, value] of Object.entries(replacements)) {
    prompt = prompt.split(token).join(value);
  }

  return prompt.split("##USER_PROMPT##").join(params.prompt);
}

/**
 * Reads a packaged prompt file required by the commit generator.
 *
 * @param promptPath Absolute prompt path resolved by the app runtime.
 * @param label Human-readable prompt label used in error messages.
 * @returns Prompt file content.
 * @throws When the runtime path is missing or unreadable.
 */
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

/**
 * Wraps command output in a Markdown code fence for prompt injection.
 *
 * @param value Raw command output.
 * @returns Fenced text block.
 */
function fence(value: string): string {
  return `\`\`\`\n${value.trim()}\n\`\`\``;
}
