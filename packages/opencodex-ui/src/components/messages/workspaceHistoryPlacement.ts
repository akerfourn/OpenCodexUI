import type { OpenCodexTurn, OpenCodexWorkspaceTransitionEvent } from "@open-codex-ui/opencodex-protocol";

/** Groups confirmed changes at their retained turn boundary without exposing hidden older history. */
export function placeWorkspaceHistory(
  events: readonly OpenCodexWorkspaceTransitionEvent[],
  turns: readonly OpenCodexTurn[],
  visibleTurnIds: readonly string[],
  hasOlderTurns: boolean
): Map<string | null, OpenCodexWorkspaceTransitionEvent[]> {
  const result = new Map<string | null, OpenCodexWorkspaceTransitionEvent[]>();
  const visible = new Set(visibleTurnIds);
  const known = new Set(turns.map(turn => turn.id));
  for (const event of events) {
    let anchor = event.afterTurnId;
    if (anchor !== null && !known.has(anchor)) {
      // Rollback may remove the captured anchor. Dated loaded turns provide a
      // fallback; missing timestamps never justify inventing a transition.
      const timestamp = Date.parse(event.occurredAt);
      if (!Number.isFinite(timestamp)) continue;
      const earlier = turns.filter(turn => turn.startedAt !== null && Date.parse(turn.startedAt) <= timestamp);
      anchor = earlier.at(-1)?.id ?? null;
    }
    if (anchor === null && (hasOlderTurns || visibleTurnIds.length < turns.length)) continue;
    if (anchor !== null && !visible.has(anchor)) continue;
    const group = result.get(anchor) ?? [];
    group.push(event);
    result.set(anchor, group);
  }
  return result;
}
