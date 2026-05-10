/**
 * Builds Codex turn input payloads.
 */
import type { v2 } from "@open-codex-ui/codex-rpc";
import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";

export function buildTurnInput(text: string, attachments: OpenCodexImageAttachment[]): v2.UserInput[] {
  const input: v2.UserInput[] = [];

  if (text.length > 0) {
    input.push({ type: "text", text, text_elements: [] });
  }

  for (const attachment of attachments) {
    if (attachment.kind !== "image") {
      continue;
    }

    if (attachment.source === "dataUrl") {
      input.push({ type: "image", url: attachment.value });
      continue;
    }

    input.push({ type: "localImage", path: attachment.value });
  }

  return input;
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createAssistantMessagePhaseKey(sourceId: string, threadId: string, messageId: string): string {
  return `${sourceId}:${threadId}:${messageId}`;
}

