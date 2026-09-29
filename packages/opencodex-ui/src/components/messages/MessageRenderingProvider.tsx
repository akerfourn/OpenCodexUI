import { useEffect, useMemo, type ReactNode } from "react";
import type { MessageRenderingStore } from "../../stores/chat/MessageRenderingStore";
import { MessageRenderingContext } from "./MessageRenderingContext";

/** Loads local exceptions once per conversation; children observe their own effective options. */
export function MessageRenderingProvider({ store, sourceId, threadId, children }: {
  store: MessageRenderingStore; sourceId: string | null; threadId: string; children: ReactNode;
}) {
  const value = useMemo(() => ({ store, context: { sourceId, threadId } }), [store, sourceId, threadId]);
  useEffect(() => {
    // The store retains the error for display and retry in the message settings menu.
    void store.load(value.context).catch(() => undefined);
  }, [store, value]);
  return <MessageRenderingContext.Provider value={value}>{children}</MessageRenderingContext.Provider>;
}
