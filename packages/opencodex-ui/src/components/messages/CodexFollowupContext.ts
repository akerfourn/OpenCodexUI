import { createContext } from "react";
import type { ChatComposerStore } from "../../stores/chat/ChatComposerStore";

/** Resolves suggestions against the currently mounted chat, never the Markdown cache. */
export const CodexFollowupContext = createContext<Pick<ChatComposerStore, "isSubmitting" | "suggestPrompt"> | null>(null);
