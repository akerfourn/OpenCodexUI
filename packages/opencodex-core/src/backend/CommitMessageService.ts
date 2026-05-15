/**
 * Generates commit messages from staged Git changes without persisting a Codex thread.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { CodexAppServerClient, CodexNotification, v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexCommitMessageGenerationResult,
  OpenCodexCommitMessageLanguage,
  OpenCodexCommitPrompt,
  OpenCodexReasoningEffort,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import { buildTurnInput } from "./turnInput.js";
import type { GitService, OpenCodexStagedCommitContext } from "./GitService.js";

type CommitMessageServiceOptions = {
  userDataPath?: string;
  defaultPromptPath?: string;
  gitService: GitService;
  getSettings(): OpenCodexSettings;
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
  ignoreThreadNotifications(threadId: string): void;
  releaseThreadNotifications(threadId: string): void;
  logger?: (message: string) => void;
};

type CommitMessageJson = {
  message: string;
};

type TurnCompletionResult = {
  turn: v2.Turn;
  streamedFinalText: string | null;
};

type TurnCompletionWaiter = {
  promise: Promise<TurnCompletionResult>;
  dispose(): void;
};

const generationTimeoutMs = 120_000;

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: {
    message: {
      type: "string",
      minLength: 1
    }
  }
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
    const stagedContext = await this.options.gitService.readStagedCommitContext(projectPath, sourceId);
    const promptText = prompt.prompt.trim().length === 0 ? prompt.defaultPrompt : prompt.prompt;
    const finalPrompt = buildGenerationPrompt({
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
      experimentalRawEvents: false,
      persistExtendedHistory: false
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
    const completed = this.createTurnCompletionWaiter(client, threadId, () => turnId);

    try {
      const turnResponse = await client.startTurn({
        threadId,
        input: buildTurnInput(prompt, []),
        model,
        effort: reasoningEffort,
        outputSchema
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

  private createTurnCompletionWaiter(
    client: CodexAppServerClient,
    threadId: string,
    getTurnId: () => string | null
  ): TurnCompletionWaiter {
    let disposeWaiter = () => {};
    const streamedMessages = new Map<string, { phase: string | null; text: string }>();
    const promise = new Promise<TurnCompletionResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        disposeWaiter();
        reject(new Error("Timed out waiting for commit message generation."));
      }, generationTimeoutMs);

      const subscription = client.onNotification((notification) => {
        applyStreamingNotification(notification, threadId, getTurnId(), streamedMessages);
        const turn = readCompletedTurn(notification, threadId, getTurnId());

        if (turn === null) {
          return;
        }

        disposeWaiter();
        resolve({
          turn,
          streamedFinalText: readStreamedFinalText(streamedMessages)
        });
      });

      disposeWaiter = () => {
        clearTimeout(timeout);
        subscription.dispose();
      };
    });

    return {
      promise,
      dispose() {
        disposeWaiter();
      }
    };
  }

  private logGenerationDiagnostics(result: TurnCompletionResult, usedCompletedTurnText: boolean): void {
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
    const promptPath = this.options.defaultPromptPath;

    if (promptPath === undefined) {
      return fallbackDefaultPrompt;
    }

    try {
      return await readFile(promptPath, "utf8");
    } catch {
      return fallbackDefaultPrompt;
    }
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

function buildGenerationPrompt(params: {
  prompt: string;
  stagedContext: OpenCodexStagedCommitContext;
  instruction: string;
  language: OpenCodexCommitMessageLanguage;
}): string {
  const language = params.language === "fr" ? "French" : "English";
  const trimmedInstruction = params.instruction.trim();
  const instructionBlock = trimmedInstruction.length === 0
    ? "No extra user instruction."
    : trimmedInstruction;
  const truncationNotice = params.stagedContext.isDiffTruncated
    ? "The staged diff below was truncated by the client output cap. Be conservative."
    : "The staged diff below is complete within the client output cap.";

  return [
    "You are generating a Git commit message in a private one-shot task.",
    "This task must not mention that it is running inside Codex or OpenCodexUI.",
    `Output language: ${language}.`,
    "",
    "Non-overridable output contract:",
    "- Return only JSON matching the provided schema: { \"message\": string }.",
    "- Put the complete commit message in the `message` string.",
    "- Do not wrap the JSON in Markdown.",
    "- Do not add a placeholder ticket reference like #0000 unless the user prompt explicitly requires it.",
    "",
    "User-editable generation rules:",
    params.prompt,
    "",
    "Extra instruction for this generation:",
    instructionBlock,
    "",
    truncationNotice,
    "",
    "Staged file summary:",
    fence(params.stagedContext.stat),
    "",
    "Staged file status:",
    fence(params.stagedContext.nameStatus),
    "",
    "Staged diff:",
    fence(params.stagedContext.diff)
  ].join("\n");
}

function fence(value: string): string {
  return `\`\`\`\n${value.trim()}\n\`\`\``;
}

function readCompletedTurn(
  notification: CodexNotification,
  threadId: string,
  turnId: string | null
): v2.Turn | null {
  if (notification.method !== "turn/completed") {
    return null;
  }

  const params = notification.params as Partial<v2.TurnCompletedNotification>;

  if (params.threadId !== threadId || params.turn === undefined) {
    return null;
  }

  if (turnId !== null && params.turn.id !== turnId) {
    return null;
  }

  return params.turn;
}

function readFinalAgentTextOrNull(turn: v2.Turn): string | null {
  const agentMessages = turn.items.filter((item) => item.type === "agentMessage");
  const finalMessage = findFinalAgentMessage(agentMessages);

  if (finalMessage === undefined) {
    return null;
  }

  return finalMessage.text;
}

function findFinalAgentMessage(agentMessages: Array<Extract<v2.ThreadItem, { type: "agentMessage" }>>) {
  for (let index = agentMessages.length - 1; index >= 0; index -= 1) {
    const message = agentMessages[index];

    if (message?.phase === "final_answer") {
      return message;
    }
  }

  return agentMessages[agentMessages.length - 1];
}

function applyStreamingNotification(
  notification: CodexNotification,
  threadId: string,
  turnId: string | null,
  messages: Map<string, { phase: string | null; text: string }>
): void {
  const params = readNotificationRecord(notification.params);

  if (readNotificationString(params.threadId) !== threadId) {
    return;
  }

  const notificationTurnId = readNotificationString(params.turnId);

  if (turnId !== null && notificationTurnId !== turnId) {
    return;
  }

  if (notification.method === "item/started") {
    applyStartedItem(params, messages);
    return;
  }

  if (notification.method === "item/agentMessage/delta") {
    applyAgentMessageDelta(params, messages);
  }
}

function applyStartedItem(
  params: Record<string, unknown>,
  messages: Map<string, { phase: string | null; text: string }>
): void {
  const item = readNotificationRecord(params.item);

  if (readNotificationString(item.type) !== "agentMessage") {
    return;
  }

  const itemId = readNotificationString(item.id);

  if (itemId.length === 0) {
    return;
  }

  messages.set(itemId, {
    phase: readNotificationString(item.phase) || null,
    text: messages.get(itemId)?.text ?? ""
  });
}

function applyAgentMessageDelta(
  params: Record<string, unknown>,
  messages: Map<string, { phase: string | null; text: string }>
): void {
  const itemId = readNotificationString(params.itemId);
  const delta = readNotificationString(params.delta);

  if (itemId.length === 0 || delta.length === 0) {
    return;
  }

  const existing = messages.get(itemId);
  messages.set(itemId, {
    phase: existing?.phase ?? null,
    text: `${existing?.text ?? ""}${delta}`
  });
}

function readStreamedFinalText(messages: Map<string, { phase: string | null; text: string }>): string | null {
  const entries = Array.from(messages.values());
  const finalEntry = findLastStreamedEntry(entries, "final_answer")
    ?? findLastStreamedEntry(entries, null);

  return finalEntry?.text ?? null;
}

function findLastStreamedEntry(
  entries: Array<{ phase: string | null; text: string }>,
  phase: string | null
): { phase: string | null; text: string } | null {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry === undefined || entry.text.trim().length === 0) {
      continue;
    }

    if (phase === null || entry.phase === phase) {
      return entry;
    }
  }

  return null;
}

function readNotificationRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

function readNotificationString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function parseCommitMessageResponse(text: string): CommitMessageJson {
  const trimmed = stripJsonFence(text.trim());
  const parsed = JSON.parse(trimmed) as Partial<CommitMessageJson>;

  if (typeof parsed.message !== "string" || parsed.message.trim().length === 0) {
    throw new Error("Commit message generation returned an invalid response.");
  }

  return {
    message: parsed.message.trim()
  };
}

function stripJsonFence(value: string): string {
  return value
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}

const fallbackDefaultPrompt = [
  "# Commit Message Generation",
  "",
  "Generate a concise Git commit message for the staged changes.",
  "",
  "Requirements:",
  "",
  "- Use Conventional Commits.",
  "- Use the format `type(scope) #0000: summary`.",
  "- Return only the requested JSON object."
].join("\n");
