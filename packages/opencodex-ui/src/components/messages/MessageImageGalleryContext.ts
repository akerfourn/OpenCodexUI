import { createContext, type RefObject } from "react";

/** A source-bound image read; raw filesystem paths never reach the browser viewer. */
export interface ViewerImage {
  id: string;
  alt: string;
  load(): Promise<string>;
}

export interface RegisteredMessageImage extends ViewerImage {
  anchor: RefObject<HTMLElement>;
}

export interface MessageImageGalleryContextValue {
  register(image: RegisteredMessageImage): () => void;
  open(id: string): void;
}

export const MessageImageGalleryContext = createContext<MessageImageGalleryContextValue | null>(null);
