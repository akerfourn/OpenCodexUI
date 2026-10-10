import { ChatImage } from "../messages/ChatImage";

/** Displays local and embedded image bytes through the document's workspace-aware image context. */
export function MarkdownPreviewImage({ src, alt, title }: { src?: string; alt?: string; title?: string }) {
  return <ChatImage src={src} alt={alt} title={title} />;
}
