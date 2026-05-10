/**
 * Summarizes Codex activity items for UI rendering.
 */
import type { OpenCodexLanguage } from "@open-codex-ui/opencodex-protocol";

import { getCoreLabels } from "./labels.js";
import { createId, readObject, readString } from "./primitives.js";

/**
 * Summarizes a known activity item.
 *
 * @param item Raw activity item.
 * @param language Language used for labels.
 *
 * @returns Summary text, or an empty string.
 */
export function summarizeActivityItem(
  item: Record<string, unknown>,
  language: OpenCodexLanguage
): string {
  const type = readString(item.type);
  const labels = getCoreLabels(language);

  if (type === "plan") {
    return readString(item.text);
  }

  if (type === "reasoning") {
    const summary = readReasoningSegments(item.summary);

    if (summary.length > 0) {
      return summary.join("\n");
    }

    return readReasoningSegments(item.content).join("\n");
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
 * Creates a fallback summary for activity types without a primary summary.
 *
 * @param type Activity type.
 * @param item Raw activity item.
 * @param language Language used for labels.
 *
 * @returns Fallback summary.
 */
export function summarizeActivityFallback(
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
 * Serializes raw activity details.
 *
 * @param item Raw activity item.
 *
 * @returns JSON details, or an empty string when serialization fails.
 */
export function summarizeActivityDetails(item: Record<string, unknown>): string {
  try {
    return JSON.stringify(item, null, 2);
  } catch {
    return "";
  }
}

/**
 * Summarizes a raw Responses API item.
 *
 * @param item Raw response item.
 *
 * @returns Human-readable item summary.
 */
export function summarizeRawResponseItem(item: Record<string, unknown>): string {
  const type = readString(item.type);
  const name = readString(item.name);
  const namespace = readString(item.namespace);
  const status = readString(item.status);

  if (name.length > 0 && namespace.length > 0) {
    return `${type}: ${namespace}/${name}`;
  }

  if (name.length > 0) {
    return `${type}: ${name}`;
  }

  if (status.length > 0) {
    return `${type}: ${status}`;
  }

  return type.length > 0 ? type : summarizeActivityDetails(item);
}

/**
 * Reads the stable identifier of a raw activity item.
 *
 * @param item Raw activity item.
 *
 * @returns Item identifier.
 */
export function readActivityItemId(item: Record<string, unknown>): string {
  return readString(item.id) || readString(item.call_id) || createId("activity");
}

/**
 * Reads a shell command from raw function-call arguments.
 *
 * @param item Raw function-call item.
 *
 * @returns Command text, or an empty string.
 */
export function readFunctionCallCommand(item: Record<string, unknown>): string {
  const argumentsValue = item.arguments;

  if (typeof argumentsValue !== "string") {
    return "";
  }

  try {
    const parsed = JSON.parse(argumentsValue) as unknown;
    return readString(readObject(parsed).command);
  } catch {
    return "";
  }
}

/**
 * Reads a command array as a shell-like command string.
 *
 * @param value Raw command array.
 *
 * @returns Command text, or an empty string.
 */
export function readCommandArray(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value.map((entry) => String(entry)).join(" ");
}

/**
 * Reads reasoning text segments from Codex summary or content payloads.
 *
 * @param value Raw reasoning segment collection.
 *
 * @returns Text segments that can be displayed in the activity block.
 */
export function readReasoningSegments(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readReasoningSegment(entry))
    .filter((entry) => entry.length > 0);
}

function readReasoningSegment(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return readString(readObject(value).text);
}
