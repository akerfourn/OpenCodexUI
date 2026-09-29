import type { MessageRenderingContext, MessageRenderingEntry } from "@open-codex-ui/opencodex-protocol";

/** Durable presentation exceptions, independent from refreshed Codex message content. */
export interface MessageRenderingRepository {
  /** Loads only exceptions for the requested conversation. */
  read(context: MessageRenderingContext): Promise<MessageRenderingEntry[]>;
  /** Replaces one exception; two inherited values remove the stored row. */
  set(context: MessageRenderingContext, entry: MessageRenderingEntry): Promise<void>;
}
