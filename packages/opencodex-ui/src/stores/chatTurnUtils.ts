import type {
  OpenCodexActivity,
  OpenCodexMessage,
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

export function findFirstChangedTurnIndex(
  currentTurns: OpenCodexTurn[],
  nextTurns: OpenCodexTurn[]
): number | null {
  const sharedLength = Math.min(currentTurns.length, nextTurns.length);

  for (let index = 0; index < sharedLength; index += 1) {
    const currentTurn = currentTurns[index];
    const nextTurn = nextTurns[index];

    if (currentTurn === undefined || nextTurn === undefined) {
      return index;
    }

    if (currentTurn.id !== nextTurn.id || getTurnSignature(currentTurn) !== getTurnSignature(nextTurn)) {
      return index;
    }
  }

  if (currentTurns.length !== nextTurns.length) {
    return sharedLength;
  }

  return null;
}

export function hasActiveRunningTurn(turns: OpenCodexTurn[], activeTurnId: string | null): boolean {
  if (activeTurnId === null) {
    return false;
  }

  const turn = turns.find((entry) => entry.id === activeTurnId);

  if (turn === undefined || turn.status === "completed") {
    return false;
  }

  return !turn.items.some((item) => item.role === "assistant" && item.phase === "final_answer");
}

export function toTurnItem(message: OpenCodexMessage): OpenCodexTurnItem {
  const item: OpenCodexTurnItem = {
    id: message.itemId ?? message.id,
    role: message.role,
    content: message.content,
    status: message.status,
    createdAt: message.createdAt
  };

  if (message.phase !== undefined) {
    item.phase = message.phase;
  }

  if (message.kind !== undefined) {
    item.kind = message.kind;
  }

  if (message.summary !== undefined) {
    item.summary = message.summary;
  }

  if (message.details !== undefined) {
    item.details = message.details;
  }

  if (message.attachments !== undefined) {
    item.attachments = message.attachments;
  }

  return item;
}

export function toMessageStatus(status: OpenCodexActivity["status"]): OpenCodexTurnItem["status"] {
  if (status === "running") {
    return "streaming";
  }

  return status;
}

function getTurnSignature(turn: OpenCodexTurn): string {
  return JSON.stringify(turn);
}
