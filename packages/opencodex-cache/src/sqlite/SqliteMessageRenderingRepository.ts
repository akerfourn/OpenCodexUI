import type { Database } from "better-sqlite3";
import type { MessageRenderingContext, MessageRenderingEntry } from "@open-codex-ui/opencodex-protocol";
import type { MessageRenderingRepository } from "../types/messageRendering.js";

/** Stores nullable booleans without copying any conversation content. */
export class SqliteMessageRenderingRepository implements MessageRenderingRepository {
  /** Shares the application's migrated database connection. */
  constructor(private readonly database: Database) {}

  /** Reads exceptions in stable order for one explicit source/thread pair. */
  async read(context: MessageRenderingContext): Promise<MessageRenderingEntry[]> {
    const rows = this.database.prepare(`
      SELECT turn_id AS turnId, item_id AS itemId, markdown, math
      FROM message_rendering WHERE thread_id = ? AND source_key = ? ORDER BY turn_id, item_id
    `).all(context.threadId, JSON.stringify(context.sourceId)) as Array<{
      turnId: string; itemId: string; markdown: number | null; math: number | null;
    }>;
    return rows.map(row => ({ ...row,
      markdown: row.markdown === null ? null : row.markdown === 1,
      math: row.math === null ? null : row.math === 1
    }));
  }

  /** Uses a separate table so cache synchronization cannot overwrite local choices. */
  async set(context: MessageRenderingContext, entry: MessageRenderingEntry): Promise<void> {
    const key = [context.threadId, JSON.stringify(context.sourceId), entry.turnId, entry.itemId];
    if (entry.markdown === null && entry.math === null) {
      this.database.prepare(`DELETE FROM message_rendering
        WHERE thread_id = ? AND source_key = ? AND turn_id = ? AND item_id = ?`).run(...key);
      return;
    }
    this.database.prepare(`INSERT INTO message_rendering
      (thread_id, source_key, turn_id, item_id, markdown, math) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (thread_id, source_key, turn_id, item_id)
      DO UPDATE SET markdown = excluded.markdown, math = excluded.math
    `).run(...key, toSqlBoolean(entry.markdown), toSqlBoolean(entry.math));
  }
}

/** Preserves null as inheritance rather than converting it to false. */
function toSqlBoolean(value: boolean | null): number | null {
  if (value === null) return null;
  return value ? 1 : 0;
}
