import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { MessageRenderingEntry, MessageRenderingRequest } from "@open-codex-ui/opencodex-protocol";

/** Presentation preferences require local persistence but no running Codex connection. */
export class MessageRenderingService {
  /** Receives the same repository used for local thread identities. */
  constructor(private readonly cache: OpenCodexCacheRepository | null) {}

  /** Validates explicit identity and values before changing durable display preferences. */
  async execute(request: MessageRenderingRequest): Promise<MessageRenderingEntry[] | void> {
    const { context } = request;
    requireId(context.threadId);
    if (context.sourceId !== null) requireId(context.sourceId);
    if (this.cache === null) throw new Error("Message rendering persistence is unavailable");
    if (request.type === "messageRendering.read") return await this.cache.messageRendering.read(context);

    const { entry } = request;
    requireId(entry.turnId);
    requireId(entry.itemId);
    for (const value of [entry.markdown, entry.math]) {
      if (value !== null && typeof value !== "boolean") throw new Error("Invalid message rendering override");
    }
    const snapshot = await this.cache.getThread(context.threadId, { latestTurnLimit: 1 });
    if (snapshot === null || snapshot.thread.sourceId !== context.sourceId) {
      throw new Error("Message conversation is unavailable or its source changed");
    }
    await this.cache.messageRendering.set(context, entry);
  }
}

/** Prevents empty or unbounded transport identifiers. */
function requireId(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 4096) {
    throw new Error("Invalid message rendering identity");
  }
}
