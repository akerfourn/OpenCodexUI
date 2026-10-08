import { createContext } from "react";

/** Image reads retain the conversation's source identity across asynchronous rendering. */
export interface ChatImageContextValue {
  loadImage(path: string): Promise<string>;
  onOpenLink(href: string): void;
}

export const ChatImageContext = createContext<ChatImageContextValue | null>(null);
