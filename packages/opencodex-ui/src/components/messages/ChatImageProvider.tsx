import { useMemo, type ReactNode } from "react";
import type { FileRequestPort } from "../../stores/files/FileDocument";
import { createChatImageLoader } from "../../stores/files/chatImageLoader";
import { ChatImageContext, type ChatImageContextValue } from "./ChatImageContext";

interface ChatImageProviderProps {
  port: FileRequestPort;
  sourceId: string | null;
  projectPath: string | null;
  onOpenLink(href: string): void;
  children: ReactNode;
}

/** Shares image reads inside one conversation's explicit source context. */
export function ChatImageProvider({ port, sourceId, projectPath, onOpenLink, children }: ChatImageProviderProps) {
  const context = useMemo<ChatImageContextValue>(() => ({
    loadImage: createChatImageLoader(port, sourceId, projectPath),
    onOpenLink
  }), [port, sourceId, projectPath, onOpenLink]);

  return <ChatImageContext.Provider value={context}>{children}</ChatImageContext.Provider>;
}
