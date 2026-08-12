import path from "node:path";

import type {
  OpenCodexReasoningEffort,
  OpenCodexSubAgentSource,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import {
  readNullableString,
  readObject,
  readString,
  readTimestamp
} from "./primitives.js";

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
