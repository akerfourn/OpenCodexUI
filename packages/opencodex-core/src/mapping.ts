import path from "node:path";

import type { CodexNotification, CodexServerRequest } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexActivity,
  OpenCodexApproval,
  OpenCodexApprovalDecision,
  OpenCodexMessage,
  OpenCodexReasoningEffort,
  OpenCodexThread
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
  const messages: OpenCodexMessage[] = [];

  for (const turnValue of turns) {
    const turn = readObject(turnValue);
    const turnId = readString(turn.id);
    const items = Array.isArray(turn.items) ? turn.items : [];

    for (const itemValue of items) {
      const item = readObject(itemValue);
      const type = readString(item.type);

      if (type === "userMessage") {
        messages.push(mapUserMessage(threadId, item, turnId));
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
          itemId: readString(item.id)
        });
      }

      if (type === "plan" || type === "reasoning" || type === "commandExecution" || type === "mcpToolCall") {
        const content = summarizeActivityItem(item);

        if (content.length > 0) {
          messages.push({
            id: readString(item.id) || createId("activity"),
            threadId,
            role: "activity",
            content,
            status: "completed",
            createdAt: null,
            turnId,
            itemId: readString(item.id)
          });
        }
      }
    }
  }

  return messages;
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
    return createActivity(itemId, threadId, "mcpTool", turnId, readString(params.message));
  }

  if (notification.method === "command/exec/outputDelta") {
    return createActivity(itemId, threadId, "command", turnId, readString(params.delta));
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

function mapUserMessage(
  threadId: string,
  item: Record<string, unknown>,
  turnId: string
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
    itemId: readString(item.id)
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
