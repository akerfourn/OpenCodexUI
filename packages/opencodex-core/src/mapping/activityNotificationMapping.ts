/**
 * Maps Codex activity payloads to UI activity records.
 */
import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import type { OpenCodexActivity } from "@open-codex-ui/opencodex-protocol";

import {
  readReasoningDeltaText,
  summarizeActivityDetails
} from "./activitySummary.js";
import {
  createRawResponseItemActivity,
  createThreadItemActivity
} from "./activityItemMapping.js";
import { createActivity, readPlanSnapshot } from "./activityHelpers.js";
import { createId, readObject, readString } from "./primitives.js";
import { sanitizeTerminalOutput } from "../backend/terminalOutput.js";

/**
 * Creates a streaming activity record from a Codex notification.
 *
 * @param notification Codex notification.
 *
 * @returns Activity record, or `null` when unsupported.
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
    return createActivity(
      itemId,
      threadId,
      "reasoning",
      turnId,
      readReasoningDeltaText(params.delta)
    );
  }

  if (notification.method === "item/reasoning/textDelta") {
    return createActivity(
      itemId,
      threadId,
      "reasoning",
      turnId,
      readReasoningDeltaText(params.delta)
    );
  }

  if (notification.method === "item/mcpToolCall/progress") {
    return createActivity(itemId, threadId, "mcpToolCall", turnId, readString(params.message));
  }

  if (
    notification.method === "command/exec/outputDelta" ||
    notification.method === "item/commandExecution/outputDelta"
  ) {
    return createActivity(
      itemId,
      threadId,
      "commandExecution",
      turnId,
      sanitizeTerminalOutput(readString(params.delta))
    );
  }

  if (notification.method === "item/fileChange/outputDelta") {
    return createActivity(
      itemId,
      threadId,
      "fileChange",
      turnId,
      sanitizeTerminalOutput(readString(params.delta))
    );
  }

  if (notification.method === "item/fileChange/patchUpdated") {
    return createActivity(itemId, threadId, "fileChange", turnId, "Modification fichier: completed");
  }

  if (notification.method === "item/commandExecution/terminalInteraction") {
    return createActivity(
      itemId,
      threadId,
      "commandExecution",
      turnId,
      sanitizeTerminalOutput(readString(params.message))
    );
  }

  if (notification.method === "turn/plan/updated") {
    return createActivity(
      `plan-${turnId}`,
      threadId,
      "plan",
      turnId,
      summarizePlanNotification(params),
      "running",
      null,
      null,
      readPlanSnapshot(params)
    );
  }

  if (notification.method === "turn/diff/updated") {
    return createActivity(
      `diff-${turnId}`,
      threadId,
      "fileChange",
      turnId,
      summarizeDiffActivity(readString(params.diff)),
      "running",
      null,
      readString(params.diff)
    );
  }

  if (notification.method === "model/rerouted") {
    const content = summarizeModelReroute(params);

    return createActivity(
      createId("model-rerouted"),
      threadId,
      "modelRerouted",
      turnId,
      content,
      "completed",
      content,
      summarizeActivityDetails(params)
    );
  }

  if (notification.method === "hook/started" || notification.method === "hook/completed") {
    return createHookActivity(notification.method, params, threadId, turnId);
  }

  if (notification.method === "item/started") {
    return createThreadItemActivity(readObject(params.item), threadId, turnId, "running");
  }

  if (notification.method === "item/completed") {
    return createThreadItemActivity(readObject(params.item), threadId, turnId, "completed");
  }

  if (notification.method === "rawResponseItem/completed") {
    return createRawResponseItemActivity(readObject(params.item), threadId, turnId);
  }

  return null;
}

/**
 * Summarizes a plan update notification.
 *
 * @param params Notification parameters.
 *
 * @returns Plan summary.
 */
function summarizePlanNotification(params: Record<string, unknown>): string {
  const explanation = readString(params.explanation);
  const plan = Array.isArray(params.plan) ? params.plan : [];
  const steps = plan
    .map((entry) => readObject(entry))
    .map((entry) => {
      const status = readString(entry.status);
      const step = readString(entry.step);
      return status.length > 0 ? `${status}: ${step}` : step;
    })
    .filter((entry) => entry.length > 0);

  return [explanation, ...steps].filter((entry) => entry.length > 0).join("\n");
}

/**
 * Creates an activity from hook lifecycle notifications.
 *
 * @param method Notification method.
 * @param params Notification parameters.
 * @param threadId Thread identifier.
 * @param fallbackTurnId Turn identifier read from the common params.
 *
 * @returns Hook activity.
 */
function createHookActivity(
  method: string,
  params: Record<string, unknown>,
  threadId: string,
  fallbackTurnId: string
): OpenCodexActivity {
  const run = readObject(params.run);
  const turnId = readString(params.turnId) || fallbackTurnId;
  const eventName = readString(run.eventName);
  const sourcePath = readString(run.sourcePath);
  const status = method === "hook/completed" ? "completed" : "running";
  const content = [
    "Hook",
    eventName,
    sourcePath
  ].filter((entry) => entry.length > 0).join(": ");

  return createActivity(
    readString(run.id) || createId("hook"),
    threadId,
    "hookPrompt",
    turnId,
    content,
    status,
    content,
    summarizeActivityDetails(run)
  );
}

/**
 * Summarizes a streamed diff update without embedding the full patch inline.
 *
 * @param diff Raw unified diff.
 * @returns Short activity summary.
 */
function summarizeDiffActivity(diff: string): string {
  const changedFileCount = countChangedFiles(diff);

  if (changedFileCount === 0) {
    return "Diff mis à jour";
  }

  if (changedFileCount === 1) {
    return "Diff mis à jour: 1 fichier modifié";
  }

  return `Diff mis à jour: ${changedFileCount} fichiers modifiés`;
}

/** Summarizes a model reroute without retaining the raw notification payload. */
function summarizeModelReroute(params: Record<string, unknown>): string {
  const fromModel = readString(params.fromModel);
  const toModel = readString(params.toModel);
  const reason = readString(params.reason);
  const transition = fromModel.length > 0 && toModel.length > 0
    ? `${fromModel} → ${toModel}`
    : toModel || fromModel || "modèle non identifié";
  const reasonLabel = reason.length > 0 ? `\nRaison : ${reason}` : "";

  return `Modèle rerouté : ${transition}${reasonLabel}`;
}

/**
 * Counts changed files in a unified diff.
 *
 * @param diff Raw unified diff.
 * @returns Number of `diff --git` file sections.
 */
function countChangedFiles(diff: string): number {
  const matches = diff.match(/^diff --git /gm);
  return matches?.length ?? 0;
}
