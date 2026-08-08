/**
 * Maps Codex app-server payloads into the OpenCodex UI data structures.
 */
import path from "node:path";

import type {
  OpenCodexImageAttachment,
  OpenCodexLanguage,
  OpenCodexMessage,
  OpenCodexReasoningEffort,
  OpenCodexSubAgentSource,
  OpenCodexThread,
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import {
  mapActivityMessage,
  mapActivityTurnItem
} from "./mapping/activity.js";
import { readTurnExecutionMetadata } from "./turnExecutionMetadata.js";
import {
  createId,
  readMessagePhase,
  readNullableNumber,
  readNullableString,
  readObject,
  readString,
  readTimestamp
} from "./mapping/primitives.js";

export { buildApprovalResponse, createApprovalRequest } from "./mapping/approvals.js";
export { createActivityFromNotification } from "./mapping/activity.js";
export {
  correlateCollaborationEvents,
  normalizeCollaborationResponseItem,
  normalizeCollaborationThreadItem,
  type CollaborationItemLifecycle,
  type CollaborationNormalizationContext
} from "./mapping/collaboration.js";
export {
  readMessagePhase,
  readNullableNumber,
  readObject,
  readString
} from "./mapping/primitives.js";

/**
 * Maps a raw Codex thread payload into the OpenCodex thread shape.
 *
 * @param value Value to normalize.
 * @param model Selected model identifier.
 * @param reasoningEffort Selected reasoning effort.
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
  const subAgentSource = readSubAgentSource(thread.source);
  const parentThreadId = readNullableString(thread.parentThreadId)
    ?? subAgentSource?.parentThreadId
    ?? null;

  return {
    id: readString(thread.id),
    sessionId: readNullableString(thread.sessionId),
    parentThreadId,
    codexTitle,
    customTitle: null,
    title,
    preview,
    model,
    reasoningEffort,
    projectName: projectPath === null ? null : path.basename(projectPath),
    projectPath,
    sourceId: null,
    branchName: readNullableString(gitInfo.branch),
    updatedAt: readTimestamp(thread.updatedAt),
    isArchived: false,
    threadSource: readNullableString(thread.threadSource),
    agentNickname: readNullableString(thread.agentNickname) ?? subAgentSource?.agentNickname ?? null,
    agentRole: readNullableString(thread.agentRole) ?? subAgentSource?.agentRole ?? null,
    subAgentSource,
    canAcceptDirectInput: readNullableBoolean(thread.canAcceptDirectInput),
    status: readThreadStatus(thread.status) ?? undefined
  };
}

/**
 * Maps the structured Codex session source for a sub-agent thread.
 *
 * @param value Raw `SessionSource` value.
 * @returns Structured sub-agent source, or `null` for a main thread.
 */
function readSubAgentSource(value: unknown): OpenCodexSubAgentSource | null {
  const source = readObject(value);
  const subAgent = source.subagent ?? source.subAgent;

  if (subAgent === undefined) {
    return null;
  }

  if (subAgent === "review" || subAgent === "compact" || subAgent === "memory_consolidation") {
    return {
      kind: subAgent === "memory_consolidation" ? "memoryConsolidation" : subAgent,
      parentThreadId: null,
      depth: null,
      agentPath: null,
      agentNickname: null,
      agentRole: null,
      label: null
    };
  }

  const subAgentObject = readObject(subAgent);
  const threadSpawn = readObject(subAgentObject.thread_spawn ?? subAgentObject.threadSpawn);

  if (Object.keys(threadSpawn).length > 0) {
    return {
      kind: "threadSpawn",
      parentThreadId: readNullableString(threadSpawn.parent_thread_id ?? threadSpawn.parentThreadId),
      depth: readNonNegativeInteger(threadSpawn.depth),
      agentPath: readNullableString(threadSpawn.agent_path ?? threadSpawn.agentPath),
      agentNickname: readNullableString(
        threadSpawn.agent_nickname ?? threadSpawn.agentNickname
      ),
      agentRole: readNullableString(threadSpawn.agent_role ?? threadSpawn.agentRole),
      label: null
    };
  }

  const otherLabel = readNullableString(subAgentObject.other);

  if (otherLabel !== null) {
    return {
      kind: "other",
      parentThreadId: null,
      depth: null,
      agentPath: null,
      agentNickname: null,
      agentRole: null,
      label: otherLabel
    };
  }

  return null;
}

/**
 * Reads a nullable boolean without coercing numbers or strings.
 *
 * @param value Raw value.
 * @returns Boolean value, or `null`.
 */
function readNullableBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Reads a non-negative integer used for an agent-tree depth.
 *
 * @param value Raw value.
 * @returns Normalized depth, or `null`.
 */
function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/**
 * Reads the string or structured thread status used across App Server versions.
 *
 * @param value Raw status value.
 * @returns Status identifier, or `null`.
 */
function readThreadStatus(value: unknown): string | null {
  return readNullableString(value) ?? readNullableString(readObject(value).type);
}

/**
 * Resolves display title.
 *
 * @param codexTitle Codex title.
 * @param customTitle Custom title.
 * @param preview Preview.
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
 * Maps one Codex user-message item to a flattened UI message.
 *
 * @param threadId Thread identifier.
 * @param item Raw user-message item.
 * @param turnId Turn identifier.
 * @param turnDurationMs Turn duration in milliseconds.
 *
 * @returns UI message.
 */
function mapUserMessage(
  threadId: string,
  item: Record<string, unknown>,
  turnId: string,
  turnDurationMs: number | null
): OpenCodexMessage {
  const content = Array.isArray(item.content) ? item.content : [];
  const attachments = content
    .map((entry) => mapUserInputAttachment(readObject(entry), readString(item.id)))
    .filter((attachment): attachment is OpenCodexImageAttachment => attachment !== null);
  const text = content
    .map((entry) => readObject(entry))
    .filter((entry) => readString(entry.type) === "text")
    .map((entry) => readString(entry.text))
    .join("\n\n");

  const message: OpenCodexMessage = {
    id: readString(item.id) || createId("user"),
    threadId,
    role: "user",
    content: text,
    status: "completed",
    createdAt: null,
    attachments,
    turnId,
    turnDurationMs,
    itemId: readString(item.id)
  };

  const kind = readUserMessageKind(item.kind);

  if (kind !== null) {
    message.kind = kind;
  }

  return message;
}

/**
 * Maps one raw Codex turn to a structured UI turn.
 *
 * @param threadId Thread identifier.
 * @param turnValue Raw turn payload.
 * @param language Language used for activity labels.
 *
 * @returns UI turn.
 */
function mapTurnToOpenCodexTurn(
  threadId: string,
  turnValue: unknown,
  language: OpenCodexLanguage
): OpenCodexTurn {
  const turn = readObject(turnValue);
  const turnId = readString(turn.id);
  const items = Array.isArray(turn.items) ? turn.items : [];
  const execution = readTurnExecutionMetadata(turn);

  const mappedTurn: OpenCodexTurn = {
    id: turnId,
    threadId,
    status: readNullableString(turn.status),
    errorMessage: readNullableString(readObject(turn.error).message),
    startedAt: readTimestamp(turn.startedAt),
    completedAt: readTimestamp(turn.completedAt),
    durationMs: readNullableNumber(turn.durationMs),
    items: items
      .map((itemValue) => mapTurnItem(itemValue, language))
      .filter((item): item is OpenCodexTurnItem => item !== null)
  };

  if (execution !== null) {
    mappedTurn.execution = execution;
  }

  return mappedTurn;
}

/**
 * Maps one raw turn item to a structured UI turn item.
 *
 * @param itemValue Raw turn item payload.
 * @param language Language used for activity labels.
 *
 * @returns UI turn item, or `null` when unsupported.
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
 * Maps a user-message item for use inside a structured turn.
 *
 * @param item Raw user-message item.
 *
 * @returns UI turn item.
 */
function mapUserTurnItem(item: Record<string, unknown>): OpenCodexTurnItem {
  const message = mapUserMessage("", item, "", null);

  const turnItem: OpenCodexTurnItem = {
    id: message.id,
    role: "user",
    content: message.content,
    status: "completed",
    createdAt: null,
    attachments: message.attachments
  };

  if (message.kind !== undefined) {
    turnItem.kind = message.kind;
  }

  return turnItem;
}

/**
 * Reads a supported user-message kind from persisted local metadata.
 *
 * @param value Raw kind value.
 * @returns Supported kind, or `null`.
 */
function readUserMessageKind(value: unknown): string | null {
  const kind = readString(value);

  if (kind === "steer") {
    return kind;
  }

  return null;
}

/**
 * Maps one Codex user input attachment.
 *
 * @param input Raw attachment payload.
 * @param itemId Owning item identifier.
 *
 * @returns UI image attachment, or `null`.
 */
function mapUserInputAttachment(
  input: Record<string, unknown>,
  itemId: string
): OpenCodexImageAttachment | null {
  const type = readString(input.type);

  if (type === "image") {
    const url = readString(input.url);

    if (url.length === 0) {
      return null;
    }

    return {
      id: createAttachmentId(itemId, url),
      kind: "image",
      source: "dataUrl",
      value: url
    };
  }

  if (type === "localImage") {
    const imagePath = readString(input.path);

    if (imagePath.length === 0) {
      return null;
    }

    return {
      id: createAttachmentId(itemId, imagePath),
      kind: "image",
      source: "localPath",
      value: imagePath,
      name: path.basename(imagePath)
    };
  }

  return null;
}

/**
 * Creates a stable-ish attachment identifier from item and value.
 *
 * @param itemId Owning item identifier.
 * @param value Attachment value.
 *
 * @returns Attachment identifier.
 */
function createAttachmentId(itemId: string, value: string): string {
  return [
    itemId.length > 0 ? itemId : "attachment",
    Math.abs(hashString(value))
  ].join(":");
}

/**
 * Computes a small numeric hash for identifier generation.
 *
 * @param value Value to hash.
 *
 * @returns Numeric hash.
 */
function hashString(value: string): number {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index);
  }

  return hash;
}
