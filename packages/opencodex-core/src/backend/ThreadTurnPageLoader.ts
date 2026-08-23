import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";

import { readObject, readString } from "../mapping.js";
import { THREAD_TURNS_PAGE_SIZE } from "./constants.js";

type ThreadTurnPageClient = Pick<
  CodexAppServerClient,
  "listThreadTurns" | "listThreadTurnItems"
>;

/**
 * Loads Codex turn pages and resolves their full item payloads.
 */
export class ThreadTurnPageLoader {
  /**
   * Reads the latest page of turns through the official RPC pagination API.
   *
   * @param client Codex app-server client.
   * @param threadId Thread identifier.
   *
   * @returns Latest full turn payloads and the older-turn cursor.
   */
  async readLatest(
    client: ThreadTurnPageClient,
    threadId: string
  ): Promise<{ turns: unknown[]; olderCursor: string | null }> {
    const response = await client.listThreadTurns({
      threadId,
      limit: THREAD_TURNS_PAGE_SIZE,
      sortDirection: "desc",
      itemsView: "full"
    });
    const responseObject = readObject(response);
    const pageTurns = Array.isArray(responseObject.data) ? responseObject.data : [];
    const fullTurns = await this.resolveFullItems(client, threadId, pageTurns);

    return {
      turns: fullTurns,
      olderCursor: readString(responseObject.nextCursor) || null
    };
  }

  /**
   * Reads an older page of turns through the official RPC pagination API.
   *
   * @param client Codex app-server client.
   * @param threadId Thread identifier.
   * @param cursor Cursor returned by the previous turn page.
   *
   * @returns Older full turn payloads and the next older-turn cursor.
   */
  async readOlder(
    client: ThreadTurnPageClient,
    threadId: string,
    cursor: string
  ): Promise<{ turns: unknown[]; olderCursor: string | null }> {
    const response = await client.listThreadTurns({
      threadId,
      cursor,
      limit: THREAD_TURNS_PAGE_SIZE,
      sortDirection: "desc",
      itemsView: "full"
    });
    const responseObject = readObject(response);
    const pageTurns = Array.isArray(responseObject.data) ? responseObject.data : [];
    const fullTurns = await this.resolveFullItems(client, threadId, pageTurns);

    return {
      turns: fullTurns,
      olderCursor: readString(responseObject.nextCursor) || null
    };
  }

  /**
   * Ensures each returned turn carries its full item list.
   *
   * @param client Codex app-server client.
   * @param threadId Thread identifier.
   * @param turns Raw turn payloads to complete.
   *
   * @returns Turn payloads with full items when Codex exposes them.
   */
  private async resolveFullItems(
    client: ThreadTurnPageClient,
    threadId: string,
    turns: unknown[]
  ): Promise<unknown[]> {
    const resolvedTurns: unknown[] = [];

    for (const turnValue of turns) {
      try {
        resolvedTurns.push(await this.resolveFullItemList(client, threadId, turnValue));
      } catch {
        resolvedTurns.push(turnValue);
      }
    }

    return resolvedTurns;
  }

  /**
   * Loads a turn item page sequence when the turn payload is not already complete.
   *
   * @param client Codex app-server client.
   * @param threadId Thread identifier.
   * @param turnValue Raw turn payload.
   *
   * @returns Original or completed turn payload.
   */
  private async resolveFullItemList(
    client: ThreadTurnPageClient,
    threadId: string,
    turnValue: unknown
  ): Promise<unknown> {
    const turn = readObject(turnValue);
    const turnId = readString(turn.id);

    if (turnId.length === 0 || readString(turn.itemsView) === "full") {
      return turnValue;
    }

    const items: unknown[] = [];
    let cursor: string | null = null;

    do {
      const response = await client.listThreadTurnItems({
        threadId,
        turnId,
        cursor,
        limit: 200,
        sortDirection: "asc"
      });
      const responseObject = readObject(response);
      const pageEntries = Array.isArray(responseObject.data) ? responseObject.data : [];
      const pageItems = pageEntries.map((entryValue) => readObject(entryValue).item);

      items.push(...pageItems);
      cursor = readString(responseObject.nextCursor) || null;
    } while (cursor !== null);

    return {
      ...turn,
      items,
      itemsView: "full"
    };
  }
}
