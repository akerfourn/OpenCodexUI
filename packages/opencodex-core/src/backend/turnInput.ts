/**
 * Builds Codex turn input payloads.
 */
import type { v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexComposerReference,
  OpenCodexImageAttachment
} from "@open-codex-ui/opencodex-protocol";

/**
 * Builds the Codex turn input payload from text and UI attachments.
 *
 * @param content User-entered text content.
 * @param attachments Image attachments selected in the composer.
 * @returns Codex thread item input payload.
 */
export function buildTurnInput(
  text: string,
  attachments: OpenCodexImageAttachment[],
  references: OpenCodexComposerReference[] = []
): v2.UserInput[] {
  const input: v2.UserInput[] = [];

  if (text.length > 0) {
    input.push({ type: "text", text, text_elements: [] });
  }

  for (const reference of references) {
    if (reference.type === "skill") {
      input.push({ type: "skill", name: reference.name, path: reference.path });
    }
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

/**
 * Creates a small process-local identifier for synthetic items.
 *
 * @param prefix Identifier prefix describing the item kind.
 * @returns Synthetic identifier.
 */
export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Creates the cache key used to remember assistant message phases.
 *
 * @param sourceId Source identifier.
 * @param threadId Thread identifier.
 * @param messageId Assistant message identifier.
 * @returns Stable phase cache key.
 */
export function createAssistantMessagePhaseKey(sourceId: string, threadId: string, messageId: string): string {
  return `${sourceId}:${threadId}:${messageId}`;
}
