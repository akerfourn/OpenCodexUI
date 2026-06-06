/**
 * Generates commit messages from staged Git changes without persisting a Codex thread.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexCommitMessageGenerationResult,
  OpenCodexCommitMessageLanguage,
  OpenCodexCommitPrompt,
  OpenCodexReasoningEffort,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import { buildTurnInput } from "./turnInput.js";
import type { GitService } from "./GitService.js";
import {
  buildCommitMessageGenerationPrompt,
  readRequiredPromptFile
} from "./commitMessagePrompt.js";
import {
  commitMessageOutputSchema,
  parseCommitMessageResponse,
  type CommitMessageJson
} from "./commitMessageResponse.js";
import {
  createCommitMessageTurnCompletionWaiter,
  readFinalAgentTextOrNull,
  type CommitMessageTurnCompletionResult
} from "./commitMessageTurnCompletion.js";

type CommitMessageServiceOptions = {
  userDataPath?: string;
  defaultPromptPath?: string;
  generationPromptPath?: string;
  gitService: GitService;
  getSettings(): OpenCodexSettings;
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
  ignoreThreadNotifications(threadId: string): void;
  releaseThreadNotifications(threadId: string): void;
  logger?: (message: string) => void;
};

/**
 * Owns the editable prompt file and one-shot commit message generation.
 */
export class CommitMessageService {
  constructor(private readonly options: CommitMessageServiceOptions) {}

  /**
   * Reads the user prompt, creating it from the embedded default when needed.
   *
   * @returns Prompt state.
   */
  async readPrompt(): Promise<OpenCodexCommitPrompt> {
    const defaultPrompt = await this.readDefaultPrompt();
    const promptPath = this.getUserPromptPath();

    try {
      const prompt = await readFile(promptPath, "utf8");
      return {
        prompt,
        defaultPrompt,
        isDefault: prompt === defaultPrompt
      };
    } catch {
      await this.writeUserPrompt(defaultPrompt);
      return {
        prompt: defaultPrompt,
        defaultPrompt,
        isDefault: true
      };
    }
  }

  /**
   * Persists the editable commit prompt.
   *
   * @param prompt Prompt content.
   * @returns Updated prompt state.
   */
  async updatePrompt(prompt: string): Promise<OpenCodexCommitPrompt> {
    await this.writeUserPrompt(prompt);
    return await this.readPrompt();
  }

  /**
   * Removes the user prompt so the default prompt is recreated.
   *
   * @returns Reset prompt state.
   */
  async resetPrompt(): Promise<OpenCodexCommitPrompt> {
    await rm(this.getUserPromptPath(), { force: true });
    return await this.readPrompt();
  }

  /**
   * Generates one commit message from the currently staged Git changes.
   *
   * @param projectPath Project working directory.
   * @param sourceId Source identifier.
   * @param instruction Optional user instruction for this generation.
   * @param model Optional model override.
   * @param language Output language.
   * @returns Generated commit message.
   */
  async generateCommitMessage(
    projectPath: string,
    sourceId: string | null,
    instruction: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null,
    language: OpenCodexCommitMessageLanguage
  ): Promise<OpenCodexCommitMessageGenerationResult> {
    const prompt = await this.readPrompt();
    const template = await this.readGenerationTemplate();
    const stagedContext = await this.options.gitService.readStagedCommitContext(projectPath, sourceId);
    const promptText = prompt.prompt.trim().length === 0 ? prompt.defaultPrompt : prompt.prompt;
    const finalPrompt = buildCommitMessageGenerationPrompt({
      template,
      prompt: promptText,
      stagedContext,
      instruction,
      language
    });
    const client = await this.options.ensureClient(sourceId);
    const selectedModel = model ?? this.options.getSettings().commitMessageModel;
    const selectedEffort = reasoningEffort ?? this.options.getSettings().commitMessageReasoningEffort;
    const thread = await client.startThread({
      cwd: projectPath,
      model: selectedModel,
      ephemeral: true,
      experimentalRawEvents: false
    });
    const threadId = thread.thread.id;
    this.options.ignoreThreadNotifications(threadId);

    try {
      const response = await this.runGenerationTurn(
        client,
        threadId,
        finalPrompt,
        selectedModel,
        selectedEffort
      );
      return { message: response.message };
    } finally {
      this.options.releaseThreadNotifications(threadId);
    }
  }

  private async runGenerationTurn(
    client: CodexAppServerClient,
    threadId: string,
    prompt: string,
    model: string | null,
    reasoningEffort: OpenCodexReasoningEffort | null
  ): Promise<CommitMessageJson> {
    let turnId: string | null = null;
    const completed = createCommitMessageTurnCompletionWaiter(client, threadId, () => turnId);

    try {
      const turnResponse = await client.startTurn({
        threadId,
        input: buildTurnInput(prompt, []),
        model,
        effort: reasoningEffort,
        outputSchema: commitMessageOutputSchema
      });

      turnId = turnResponse.turn.id;
      const result = await completed.promise;
      const completedTurnText = readFinalAgentTextOrNull(result.turn);
      const finalText = completedTurnText ?? result.streamedFinalText;
      this.logGenerationDiagnostics(result, completedTurnText !== null);

      if (finalText === null) {
        throw new Error("Commit message generation did not return a final answer.");
      }

      try {
        return parseCommitMessageResponse(finalText);
      } catch (error) {
        this.options.logger?.(
          `commit message generation parse failed: textLength=${finalText.length}, error=${String(error)}`
        );
        throw error;
      }
    } catch (error) {
      completed.dispose();
      throw error;
    }
  }

  private logGenerationDiagnostics(
    result: CommitMessageTurnCompletionResult,
    usedCompletedTurnText: boolean
  ): void {
    this.options.logger?.(`commit message generation completed: ${JSON.stringify({
      turnId: result.turn.id,
      turnStatus: result.turn.status,
      itemsView: result.turn.itemsView,
      itemCount: result.turn.items.length,
      itemTypes: result.turn.items.map((item) => item.type),
      agentMessages: result.turn.items
        .filter((item) => item.type === "agentMessage")
        .map((item) => ({
          phase: item.phase,
          textLength: item.text.length
        })),
      streamedFinalTextLength: result.streamedFinalText?.length ?? 0,
      usedCompletedTurnText
    })}`);
  }

  private async readDefaultPrompt(): Promise<string> {
    return await readRequiredPromptFile(this.options.defaultPromptPath, "default commit prompt");
  }

  private async readGenerationTemplate(): Promise<string> {
    return await readRequiredPromptFile(this.options.generationPromptPath, "commit generation template");
  }

  private getUserPromptPath(): string {
    if (this.options.userDataPath === undefined) {
      throw new Error("User data path is required to store the commit prompt.");
    }

    return path.join(this.options.userDataPath, "prompt-commit.user.md");
  }

  private async writeUserPrompt(prompt: string): Promise<void> {
    const promptPath = this.getUserPromptPath();
    await mkdir(path.dirname(promptPath), { recursive: true });
    await writeFile(promptPath, prompt, "utf8");
  }
}
