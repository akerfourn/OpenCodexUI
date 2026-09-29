import { createContext } from "react";
import type { MessageRenderingContext as ThreadContext } from "@open-codex-ui/opencodex-protocol";
import type { MessageRenderingStore } from "../../stores/chat/MessageRenderingStore";

/** Supplies presentation context through reasoning and answer rows without modifying thread data. */
export const MessageRenderingContext = createContext<{
  store: MessageRenderingStore;
  context: ThreadContext;
} | null>(null);
