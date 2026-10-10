import { useMemo, type ReactNode } from "react";
import type { OpenCodexFileTarget } from "@open-codex-ui/opencodex-protocol";
import type { FileRequestPort } from "../../stores/files/FileDocument";
import { createMarkdownImageLoader } from "../../stores/files/markdownImageLoader";
import { ChatImageContext, type ChatImageContextValue } from "../messages/ChatImageContext";

interface FileMarkdownImageProviderProps {
  target: Readonly<OpenCodexFileTarget> | null;
  port: FileRequestPort;
  onOpenLink(href: string): void;
  children: ReactNode;
}

/** Reuses the image/zoom renderer with workspace-bound reads rather than chat artifact access. */
export function FileMarkdownImageProvider({ target, port, onOpenLink, children }: FileMarkdownImageProviderProps) {
  const context = useMemo<ChatImageContextValue>(() => ({
    loadImage: createMarkdownImageLoader(port, target),
    onOpenLink
  }), [target, port, onOpenLink]);
  return <ChatImageContext.Provider value={context}>{children}</ChatImageContext.Provider>;
}
