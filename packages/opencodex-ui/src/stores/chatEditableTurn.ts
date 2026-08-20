/**
 * Pure helpers for finding the latest user turn that can be edited.
 */
import type {
  OpenCodexImageAttachment,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

/** Payload used to initialize the edit composer for one user item. */
export interface EditableChatItem {
  turnId: string;
  itemId: string;
  content: string;
  attachments: OpenCodexImageAttachment[];
}

/** Identity used to render edit controls without copying the message body. */
export interface EditableChatItemIdentity {
  turnId: string;
  itemId: string;
}

/**
 * Reads the latest editable user item from a loaded timeline.
 *
 * @param turns Loaded chat turns.
 * @param isAllowed Whether runtime and project guards allow editing.
 * @returns Editable item payload, or `null` when no item qualifies.
 */
export function readEditableChatItem(
  turns: readonly OpenCodexTurn[],
  isAllowed: boolean
): EditableChatItem | null {
  if (!isAllowed) {
    return null;
  }

  const lastTurn = turns.at(-1);

  if (
    lastTurn === undefined ||
    lastTurn.id.startsWith("pending:") ||
    !isEditableTerminalTurnStatus(lastTurn.status)
  ) {
    return null;
  }

  const userItems = lastTurn.items.filter((item) => item.role === "user");

  if (userItems.length !== 1) {
    return null;
  }

  const userItem = userItems[0];

  if (userItem === undefined || userItem.kind === "steer") {
    return null;
  }

  return {
    turnId: lastTurn.id,
    itemId: userItem.id,
    content: userItem.content,
    attachments: userItem.attachments ?? []
  };
}

/**
 * Reads the identity of the latest editable user item.
 *
 * @param turns Loaded chat turns.
 * @param isAllowed Whether runtime and project guards allow editing.
 * @returns Editable item identity, or `null` when no item qualifies.
 */
export function readEditableChatItemIdentity(
  turns: readonly OpenCodexTurn[],
  isAllowed: boolean
): EditableChatItemIdentity | null {
  const editableItem = readEditableChatItem(turns, isAllowed);

  if (editableItem === null) {
    return null;
  }

  return {
    turnId: editableItem.turnId,
    itemId: editableItem.itemId
  };
}

/**
 * Checks whether a terminal turn can be rolled back for editing.
 *
 * @param status Turn status reported by Codex.
 * @returns Whether the status represents a finished editable turn.
 */
function isEditableTerminalTurnStatus(status: string | null): boolean {
  return status === "completed" || status === "failed" || status === "interrupted";
}
