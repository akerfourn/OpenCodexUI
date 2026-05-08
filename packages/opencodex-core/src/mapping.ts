/**
 * Maps Codex app-server payloads into the OpenCodex UI data structures.
 */
import path from "node:path";

import type { CodexNotification, CodexServerRequest } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexActivity,
  OpenCodexApproval,
  OpenCodexApprovalDecision,
  OpenCodexLanguage,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexReasoningEffort,
  OpenCodexThread,
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

/**
 * Maps a raw Codex thread payload into the OpenCodex thread shape.
 *
 * @param value Value to normalize.
 * @param model Selected model identifier.
 * @param reasoningEffort Selected reasoning effort.
 *
 * @returns Computed value.
 */
export function mapThread(
  value: unknown,
  model: string | null = null,
  reasoningEffort: OpenCodexReasoningEffort | null = null
): OpenCodexThread {
  const thread = readObject(value);
  const gitInfo = readObject(thread.gitInfo);
  const projectPath = readNullableString(thread.cwd);
  const codexTitle = readString(thread.name);
  const preview = readString(thread.preview);
  const title = resolveDisplayTitle(codexTitle, null, preview);

  return {
    id: readString(thread.id),
    codexTitle,
    customTitle: null,
    title,
    preview,
    model,
    reasoningEffort,
    projectName: projectPath === null ? null : path.basename(projectPath),
    projectPath,
    branchName: readNullableString(gitInfo.branch),
    updatedAt: readTimestamp(thread.updatedAt),
    status: readNullableString(thread.status) ?? undefined
  };
}

/**
 * Resolves display title.
 *
 * @param codexTitle Codex title.
 * @param customTitle Custom title.
 * @param preview Preview.
 *
 * @returns Computed string value.
 */
export function resolveDisplayTitle(
  codexTitle: string,
  customTitle: string | null,
  preview: string
): string {
  const trimmedCustomTitle = customTitle?.trim() ?? "";
  const trimmedCodexTitle = codexTitle.trim();

  if (trimmedCustomTitle.length > 0) {
    return trimmedCustomTitle;
  }

  if (trimmedCodexTitle.length > 0) {
    return trimmedCodexTitle;
  }

  return preview;
}

/**
 * Maps thread messages.
 *
 * @param value Value to normalize.
 *
 * @returns Requested values.
 */
export function mapThreadMessages(value: unknown): OpenCodexMessage[] {
  const thread = readObject(value);
  const threadId = readString(thread.id);
  const turns = Array.isArray(thread.turns) ? thread.turns : [];

  return mapTurnsToMessages(threadId, turns);
}

/**
 * Maps raw turn payloads into flattened UI messages.
 *
 * @param threadId Thread identifier.
 * @param turns Turn collection to process.
 *
 * @returns Requested values.
 */
export function mapTurnsToMessages(threadId: string, turns: unknown[]): OpenCodexMessage[] {
  const messages: OpenCodexMessage[] = [];

  for (const turnValue of turns) {
    const turn = readObject(turnValue);
    const turnId = readString(turn.id);
    const turnDurationMs = readNullableNumber(turn.durationMs);
    const items = Array.isArray(turn.items) ? turn.items : [];

    for (const itemValue of items) {
      const item = readObject(itemValue);
      const type = readString(item.type);

      if (type === "userMessage") {
        messages.push(mapUserMessage(threadId, item, turnId, turnDurationMs));
        continue;
      }

      if (type === "agentMessage") {
        messages.push({
          id: readString(item.id) || createId("assistant"),
          threadId,
          role: "assistant",
          content: readString(item.text),
          status: "completed",
          createdAt: null,
          turnId,
          turnDurationMs,
          itemId: readString(item.id),
          phase: readMessagePhase(item.phase)
        });
        continue;
      }

      const activityMessage = mapActivityMessage(threadId, item, turnId, turnDurationMs);

      if (activityMessage !== null) {
        messages.push(activityMessage);
      }
    }
  }

  return messages;
}

/**
 * Maps raw turn payloads into structured UI turns.
 *
 * @param threadId Thread identifier.
 * @param turns Turn collection to process.
 * @param language Language used for localized labels.
 *
 * @returns Requested values.
 */
export function mapTurnsToOpenCodexTurns(
  threadId: string,
  turns: unknown[],
  language: OpenCodexLanguage = "fr"
): OpenCodexTurn[] {
  return turns.map((turnValue) => mapTurnToOpenCodexTurn(threadId, turnValue, language));
}

/**
 * Creates an activity item from a Codex notification when supported.
 *
 * @param notification Notification payload emitted by Codex.
 *
 * @returns Computed value.
 */
export function createActivityFromNotification(notification: CodexNotification): OpenCodexActivity | null {
  const params = readObject(notification.params);
  const threadId = readString(params.threadId);
  const turnId = readString(params.turnId);
  const itemId = readString(params.itemId) || createId("activity");

  if (threadId.length === 0) {
    return null;
  }

  if (notification.method === "item/reasoning/summaryTextDelta") {
    return createActivity(itemId, threadId, "reasoning", turnId, readString(params.delta));
  }

  if (notification.method === "item/reasoning/textDelta") {
    return createActivity(itemId, threadId, "reasoning", turnId, readString(params.delta));
  }

  if (notification.method === "item/mcpToolCall/progress") {
    return createActivity(itemId, threadId, "mcpToolCall", turnId, readString(params.message));
  }

  if (notification.method === "command/exec/outputDelta") {
    return createActivity(itemId, threadId, "commandExecution", turnId, readString(params.delta));
  }

  if (notification.method === "item/fileChange/outputDelta") {
    return createActivity(itemId, threadId, "fileChange", turnId, readString(params.delta));
  }

  return null;
}

/**
 * Creates a UI approval request from a server-side approval payload.
 *
 * @param request Request payload.
 * @param language Language used for localized labels.
 *
 * @returns Computed value.
 */
export function createApprovalRequest(
  request: CodexServerRequest,
  language: OpenCodexLanguage = "fr"
): OpenCodexApproval {
  const params = readObject(request.params);
  const threadId = readNullableString(params.threadId) ?? undefined;

  return {
    id: String(request.id),
    threadId,
    title: createApprovalTitle(request.method, params, language),
    kind: createApprovalKind(request.method),
    body: JSON.stringify(request.params ?? {}, null, 2),
    reason: readNullableString(params.reason),
    command: readNullableString(params.command),
    cwd: readNullableString(params.cwd),
    grantRoot: readNullableString(params.grantRoot),
    permissions: params.permissions,
    choices: readAvailableDecisions(params.availableDecisions)
  };
}

/**
 * Builds the approval response payload expected by the server method.
 *
 * @param method Method name or method identifier.
 * @param decision Approval decision to apply.
 *
 * @returns Computed value.
 */
export function buildApprovalResponse(method: string, decision: OpenCodexApprovalDecision): unknown {
  if (method === "item/commandExecution/requestApproval") {
    return { decision };
  }

  if (method === "item/fileChange/requestApproval") {
    return { decision };
  }

  if (method === "execCommandApproval" || method === "applyPatchApproval") {
    return { decision: mapLegacyDecision(decision) };
  }

  return { decision };
}

/**
 * Reads object.
 *
 * @param value Value to normalize.
 *
 * @returns Computed value.
 */
export function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

/**
 * Reads string.
 *
 * @param value Value to normalize.
 *
 * @returns Computed string value.
 */
export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Reads nullable number.
 *
 * @param value Value to normalize.
 *
 * @returns Numeric value, or `null` when unavailable.
 */
export function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads message phase.
 *
 * @param value Value to normalize.
 *
 * @returns Computed value.
 */
export function readMessagePhase(value: unknown): OpenCodexMessagePhase | null {
  const phase = readString(value);

  if (phase === "commentary" || phase === "final_answer") {
    return phase;
  }

  return null;
}

/**
 * Maps user message.
 *
 * @param threadId Thread identifier.
 * @param item Item payload.
 * @param turnId Turn identifier.
 * @param turnDurationMs Turn duration ms.
 *
 * @returns Computed value.
 */
function mapUserMessage(
  threadId: string,
  item: Record<string, unknown>,
  turnId: string,
  turnDurationMs: number | null
): OpenCodexMessage {
  const content = Array.isArray(item.content) ? item.content : [];
  const text = content
    .map((entry) => readObject(entry))
    .filter((entry) => readString(entry.type) === "text")
    .map((entry) => readString(entry.text))
    .join("\n\n");

  return {
    id: readString(item.id) || createId("user"),
    threadId,
    role: "user",
    content: text,
    status: "completed",
    createdAt: null,
    turnId,
    turnDurationMs,
    itemId: readString(item.id)
  };
}

/**
 * Maps turn to open codex turn.
 *
 * @param threadId Thread identifier.
 * @param turnValue Raw turn payload.
 * @param language Language used for localized labels.
 *
 * @returns Computed value.
 */
function mapTurnToOpenCodexTurn(
  threadId: string,
  turnValue: unknown,
  language: OpenCodexLanguage
): OpenCodexTurn {
  const turn = readObject(turnValue);
  const turnId = readString(turn.id);
  const items = Array.isArray(turn.items) ? turn.items : [];

  return {
    id: turnId,
    threadId,
    status: readNullableString(turn.status),
    startedAt: readNullableString(turn.startedAt),
    completedAt: readNullableString(turn.completedAt),
    durationMs: readNullableNumber(turn.durationMs),
    items: items
      .map((itemValue) => mapTurnItem(itemValue, language))
      .filter((item): item is OpenCodexTurnItem => item !== null)
  };
}

/**
 * Maps turn item.
 *
 * @param itemValue Raw item payload.
 * @param language Language used for localized labels.
 *
 * @returns Computed value.
 */
function mapTurnItem(itemValue: unknown, language: OpenCodexLanguage): OpenCodexTurnItem | null {
  const item = readObject(itemValue);
  const type = readString(item.type);

  if (type === "userMessage") {
    return mapUserTurnItem(item);
  }

  if (type === "agentMessage") {
    return {
      id: readString(item.id) || createId("assistant"),
      role: "assistant",
      content: readString(item.text),
      status: "completed",
      createdAt: null,
      phase: readMessagePhase(item.phase)
    };
  }

  return mapActivityTurnItem(item, language);
}

/**
 * Maps user turn item.
 *
 * @param item Item payload.
 *
 * @returns Computed value.
 */
function mapUserTurnItem(item: Record<string, unknown>): OpenCodexTurnItem {
  const message = mapUserMessage("", item, "", null);

  return {
    id: message.id,
    role: "user",
    content: message.content,
    status: "completed",
    createdAt: null
  };
}

/**
 * Maps activity turn item.
 *
 * @param item Item payload.
 * @param language Language used for localized labels.
 *
 * @returns Computed value.
 */
function mapActivityTurnItem(
  item: Record<string, unknown>,
  language: OpenCodexLanguage
): OpenCodexTurnItem | null {
  const type = readString(item.type);

  if (type.length === 0) {
    return null;
  }

  const summary = summarizeActivityItem(item, language);
  const details = summarizeActivityDetails(item);
  const content = summary.length > 0 ? summary : summarizeActivityFallback(type, item, language);

  return {
    id: readString(item.id) || createId("activity"),
    role: "activity",
    content,
    status: "completed",
    createdAt: null,
    kind: type,
    summary: summary.length > 0 ? summary : null,
    details: details.length > 0 ? details : null
  };
}

/**
 * Maps activity message.
 *
 * @param threadId Thread identifier.
 * @param item Item payload.
 * @param turnId Turn identifier.
 * @param turnDurationMs Turn duration ms.
 *
 * @returns Computed value.
 */
function mapActivityMessage(
  threadId: string,
  item: Record<string, unknown>,
  turnId: string,
  turnDurationMs: number | null
): OpenCodexMessage | null {
  const type = readString(item.type);

  if (type.length === 0) {
    return null;
  }

  const summary = summarizeActivityItem(item, "fr");
  const details = summarizeActivityDetails(item);
  const content = summary.length > 0 ? summary : summarizeActivityFallback(type, item, "fr");

  return {
    id: readString(item.id) || createId("activity"),
    threadId,
    role: "activity",
    content,
    status: "completed",
    createdAt: null,
    turnId,
    turnDurationMs,
    itemId: readString(item.id),
    kind: type,
    summary: summary.length > 0 ? summary : null,
    details: details.length > 0 ? details : null
  };
}

/**
 * Handles summarize activity item.
 *
 * @param item Item payload.
 * @param language Language used for localized labels.
 *
 * @returns Computed string value.
 */
function summarizeActivityItem(item: Record<string, unknown>, language: OpenCodexLanguage): string {
  const type = readString(item.type);
  const labels = getCoreLabels(language);

  if (type === "plan") {
    return readString(item.text);
  }

  if (type === "reasoning") {
    const summary = Array.isArray(item.summary) ? item.summary : [];
    return summary.map((entry) => String(entry)).join("\n");
  }

  if (type === "commandExecution") {
    return `${labels.command}: ${readString(item.command)}`;
  }

  if (type === "mcpToolCall") {
    return `${labels.mcpTool}: ${readString(item.server)} / ${readString(item.tool)}`;
  }

  return "";
}

/**
 * Handles summarize activity fallback.
 *
 * @param type Type.
 * @param item Item payload.
 * @param language Language used for localized labels.
 *
 * @returns Computed string value.
 */
function summarizeActivityFallback(
  type: string,
  item: Record<string, unknown>,
  language: OpenCodexLanguage
): string {
  const labels = getCoreLabels(language);

  if (type === "fileChange") {
    return `${labels.fileChange}: ${readString(item.status) || labels.inProgress}`;
  }

  if (type === "webSearch") {
    return `${labels.webSearch}: ${readString(item.query)}`;
  }

  if (type === "imageView") {
    return `Image: ${readString(item.path)}`;
  }

  if (type === "imageGeneration") {
    return labels.imageGeneration;
  }

  if (type === "dynamicToolCall") {
    return `${labels.dynamicTool}: ${readString(item.tool)}`;
  }

  if (type === "collabAgentToolCall") {
    return `${labels.collabAgent}: ${readString(item.tool)}`;
  }

  if (type === "enteredReviewMode") {
    return labels.enteredReviewMode;
  }

  if (type === "exitedReviewMode") {
    return labels.exitedReviewMode;
  }

  if (type === "contextCompaction") {
    return labels.contextCompaction;
  }

  if (type === "hookPrompt") {
    return "Hook";
  }

  return type;
}

/**
 * Handles summarize activity details.
 *
 * @param item Item payload.
 *
 * @returns Computed string value.
 */
function summarizeActivityDetails(item: Record<string, unknown>): string {
  try {
    return JSON.stringify(item, null, 2);
  } catch {
    return "";
  }
}

/**
 * Creates approval title.
 *
 * @param method Method name or method identifier.
 * @param params Method parameters.
 * @param language Language used for localized labels.
 *
 * @returns Computed string value.
 */
function createApprovalTitle(
  method: string,
  params: Record<string, unknown>,
  language: OpenCodexLanguage
): string {
  const labels = getCoreLabels(language);

  if (method === "item/commandExecution/requestApproval") {
    return `${labels.command}: ${readString(params.command) || labels.approvalRequired}`;
  }

  if (method === "item/fileChange/requestApproval") {
    return `${labels.fileChange}: ${readString(params.grantRoot) || labels.approvalRequired}`;
  }

  if (method === "item/permissions/requestApproval") {
    return labels.permissionsRequested;
  }

  return method;
}

/**
 * Creates approval kind.
 *
 * @param method Method name or method identifier.
 *
 * @returns Computed value.
 */
function createApprovalKind(method: string): OpenCodexApproval["kind"] {
  if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
    return "command";
  }

  if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
    return "fileChange";
  }

  if (method === "item/permissions/requestApproval") {
    return "permissions";
  }

  return "other";
}

/**
 * Reads available decisions.
 *
 * @param value Value to normalize.
 *
 * @returns Requested values.
 */
function readAvailableDecisions(value: unknown): OpenCodexApprovalDecision[] {
  if (!Array.isArray(value)) {
    return ["accept", "acceptForSession", "decline", "cancel"];
  }

  const decisions = value.filter(isApprovalDecision);
  const fallbackDecisions: OpenCodexApprovalDecision[] = ["accept", "decline", "cancel"];
  const availableDecisions = decisions.length > 0 ? decisions : fallbackDecisions;
  return availableDecisions.includes("decline") ? availableDecisions : [...availableDecisions, "decline"];
}

/**
 * Checks whether approval decision.
 *
 * @param value Value to normalize.
 *
 * @returns Computed value.
 */
function isApprovalDecision(value: unknown): value is OpenCodexApprovalDecision {
  if (
    value === "accept" ||
    value === "acceptForSession" ||
    value === "decline" ||
    value === "cancel"
  ) {
    return true;
  }

  const candidate = readObject(value);
  const execpolicyDecision = readObject(candidate.acceptWithExecpolicyAmendment);
  const networkPolicyDecision = readObject(candidate.applyNetworkPolicyAmendment);
  const execpolicyAmendment = execpolicyDecision.execpolicy_amendment;
  const networkPolicyAmendment = readObject(networkPolicyDecision.network_policy_amendment);
  const networkAction = networkPolicyAmendment.action;

  if (Array.isArray(execpolicyAmendment) && execpolicyAmendment.every(isString)) {
    return true;
  }

  return (
    typeof networkPolicyAmendment.host === "string" &&
    (networkAction === "allow" || networkAction === "deny")
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * Maps legacy decision.
 *
 * @param decision Approval decision to apply.
 *
 * @returns Computed string value.
 */
function mapLegacyDecision(decision: OpenCodexApprovalDecision): string {
  if (decision === "accept") {
    return "approved";
  }

  if (decision === "acceptForSession") {
    return "approved_for_session";
  }

  if (decision === "cancel") {
    return "abort";
  }

  return "denied";
}

/**
 * Creates activity.
 *
 * @param id Identifier value.
 * @param threadId Thread identifier.
 * @param kind Kind.
 * @param turnId Turn identifier.
 * @param content Text content to process.
 *
 * @returns Computed value.
 */
function createActivity(
  id: string,
  threadId: string,
  kind: string,
  turnId: string,
  content: string
): OpenCodexActivity {
  return {
    id,
    threadId,
    kind,
    title: turnId.length > 0 ? turnId : undefined,
    content,
    status: "running"
  };
}

/**
 * Reads nullable string.
 *
 * @param value Value to normalize.
 *
 * @returns String value, or `null` when unavailable.
 */
function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Reads timestamp.
 *
 * @param value Value to normalize.
 *
 * @returns String value, or `null` when unavailable.
 */
function readTimestamp(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

/**
 * Creates id.
 *
 * @param prefix String prefix used to build an identifier.
 *
 * @returns Computed string value.
 */
function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Returns core labels.
 *
 * @param language Language used for localized labels.
 *
 * @returns Computed value.
 */
function getCoreLabels(language: OpenCodexLanguage): CoreLabels {
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
    enteredReviewMode: "Entrée en mode revue",
    exitedReviewMode: "Sortie du mode revue",
    fileChange: "Modification fichier",
    imageGeneration: "Génération image",
    inProgress: "en cours",
    mcpTool: "Outil MCP",
    permissionsRequested: "Permissions supplémentaires demandées",
    webSearch: "Recherche web"
  };
}

type CoreLabels = {
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
