import { ChatImage } from "../messages/ChatImage";

/** Displays local and embedded image bytes through the document's workspace-aware image context. */
export function MarkdownPreviewImage({ src, alt, title, width, height }: {
  src?: string; alt?: string; title?: string; width?: number | string; height?: number | string;
}) {
  return <ChatImage src={src} alt={alt} title={title} width={width} height={height} />;
}
