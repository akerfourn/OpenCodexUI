import { createContext } from "react";

/** Resolves link actions at mount time, independently of cached Markdown trees. */
export interface MarkdownLinkContextValue {
  requireModifiedClick: boolean;
  onOpenLink(href: string): void;
}

export const MarkdownLinkContext = createContext<MarkdownLinkContextValue | null>(null);
