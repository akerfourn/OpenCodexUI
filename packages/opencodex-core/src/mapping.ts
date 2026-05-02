import path from "node:path";

import type { CodexNotification, CodexServerRequest } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexActivity,
  OpenCodexApproval,
  OpenCodexApprovalDecision,
  OpenCodexMessage,
  OpenCodexMessagePhase,
  OpenCodexReasoningEffort,
  OpenCodexThread,
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

export function mapThread(
  value: unknown,
  model: string | null = null,
  reasoningEffort: OpenCodexReasoningEffort | null = null
): OpenCodexThread {
  const thread = readObject(value);
  const gitInfo = readObject(thread.gitInfo);
  const projectPath = readNullableString(thread.cwd);
  const title = readString(thread.name);
  const preview = readString(thread.preview);

  return {
    id: readString(thread.id),
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

export function mapThreadMessages(value: unknown): OpenCodexMessage[] {
  const thread = readObject(value);
  const threadId = readString(thread.id);
  const turns = Array.isArray(thread.turns) ? thread.turns : [];

  return mapTurnsToMessages(threadId, turns);
}

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

export function mapTurnsToOpenCodexTurns(threadId: string, turns: unknown[]): OpenCodexTurn[] {
  return turns.map((turnValue) => mapTurnToOpenCodexTurn(threadId, turnValue));
}

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

export function createApprovalRequest(request: CodexServerRequest): OpenCodexApproval {
  const params = readObject(request.params);
  const threadId = readNullableString(params.threadId) ?? undefined;

  return {
    id: String(request.id),
    threadId,
    title: createApprovalTitle(request.method, params),
    kind: createApprovalKind(request.method),
    body: JSON.stringify(request.params ?? {}, null, 2),
    choices: readAvailableDecisions(params.availableDecisions)
  };
}

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

export function readObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function readNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readMessagePhase(value: unknown): OpenCodexMessagePhase | null {
  const phase = readString(value);

  if (phase === "commentary" || phase === "final_answer") {
    return phase;
  }

  return null;
}

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

function mapTurnToOpenCodexTurn(threadId: string, turnValue: unknown): OpenCodexTurn {
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
      .map((itemValue) => mapTurnItem(itemValue))
      .filter((item): item is OpenCodexTurnItem => item !== null)
  };
}

function mapTurnItem(itemValue: unknown): OpenCodexTurnItem | null {
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

  return mapActivityTurnItem(item);
}

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

function mapActivityTurnItem(item: Record<string, unknown>): OpenCodexTurnItem | null {
  const type = readString(item.type);

  if (type.length === 0) {
    return null;
  }

  const summary = summarizeActivityItem(item);
  const details = summarizeActivityDetails(item);
  const content = summary.length > 0 ? summary : summarizeActivityFallback(type, item);

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

  const summary = summarizeActivityItem(item);
  const details = summarizeActivityDetails(item);
  const content = summary.length > 0 ? summary : summarizeActivityFallback(type, item);

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

function summarizeActivityItem(item: Record<string, unknown>): string {
  const type = readString(item.type);

  if (type === "plan") {
    return readString(item.text);
  }

  if (type === "reasoning") {
    const summary = Array.isArray(item.summary) ? item.summary : [];
    return summary.map((entry) => String(entry)).join("\n");
  }

  if (type === "commandExecution") {
    return `Commande: ${readString(item.command)}`;
  }

  if (type === "mcpToolCall") {
    return `Outil MCP: ${readString(item.server)} / ${readString(item.tool)}`;
  }

  return "";
}

function summarizeActivityFallback(type: string, item: Record<string, unknown>): string {
  if (type === "fileChange") {
    return `Modification fichier: ${readString(item.status) || "en cours"}`;
  }

  if (type === "webSearch") {
    return `Recherche web: ${readString(item.query)}`;
  }

  if (type === "imageView") {
    return `Image: ${readString(item.path)}`;
  }

  if (type === "imageGeneration") {
    return "Génération image";
  }

  if (type === "dynamicToolCall") {
    return `Outil dynamique: ${readString(item.tool)}`;
  }

  if (type === "collabAgentToolCall") {
    return `Agent collaboratif: ${readString(item.tool)}`;
  }

  if (type === "enteredReviewMode") {
    return "Entrée en mode revue";
  }

  if (type === "exitedReviewMode") {
    return "Sortie du mode revue";
  }

  if (type === "contextCompaction") {
    return "Compactage du contexte";
  }

  if (type === "hookPrompt") {
    return "Hook";
  }

  return type;
}

function summarizeActivityDetails(item: Record<string, unknown>): string {
  try {
    return JSON.stringify(item, null, 2);
  } catch {
    return "";
  }
}

function createApprovalTitle(method: string, params: Record<string, unknown>): string {
  if (method === "item/commandExecution/requestApproval") {
    return `Commande: ${readString(params.command) || "approbation requise"}`;
  }

  if (method === "item/fileChange/requestApproval") {
    return `Modification fichier: ${readString(params.grantRoot) || "approbation requise"}`;
  }

  if (method === "item/permissions/requestApproval") {
    return "Permissions supplémentaires demandées";
  }

  return method;
}

function createApprovalKind(method: string): OpenCodexApproval["kind"] {
  if (method === "item/commandExecution/requestApproval" || method === "execCommandApproval") {
    return "command";
  }

  if (method === "item/fileChange/requestApproval" || method === "applyPatchApproval") {
    return "fileChange";
  }

  return "other";
}

function readAvailableDecisions(value: unknown): OpenCodexApprovalDecision[] {
  if (!Array.isArray(value)) {
    return ["accept", "acceptForSession", "decline", "cancel"];
  }

  const decisions = value.filter(isApprovalDecision);
  return decisions.length > 0 ? decisions : ["accept", "decline", "cancel"];
}

function isApprovalDecision(value: unknown): value is OpenCodexApprovalDecision {
  return value === "accept" || value === "acceptForSession" || value === "decline" || value === "cancel";
}

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

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function readTimestamp(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }

  return new Date(value * 1000).toISOString();
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
