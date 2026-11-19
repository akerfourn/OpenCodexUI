import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { MessageImageGalleryContext, type RegisteredMessageImage, type ViewerImage } from "./MessageImageGalleryContext";
import { ImageViewerDialog } from "./ImageViewerDialog";

interface OpenGallery {
  images: ViewerImage[];
  initialIndex: number;
}

/** Orders occurrences by their rendered position, independent of asynchronous image loading. */
function compareImages(left: RegisteredMessageImage, right: RegisteredMessageImage): number {
  const leftElement = left.anchor.current;
  const rightElement = right.anchor.current;
  if (leftElement === null || rightElement === null) return 0;
  const position = leftElement.compareDocumentPosition(rightElement);
  if ((position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0) return -1;
  if ((position & Node.DOCUMENT_POSITION_PRECEDING) !== 0) return 1;
  return 0;
}

/** Isolates navigation to one message without adding layout wrappers to the Markdown tree. */
export function MessageImageGallery({ children }: { children: ReactNode }) {
  const registry = useRef(new Map<string, RegisteredMessageImage>());
  const [opened, setOpened] = useState<OpenGallery | null>(null);
  const register = useCallback((image: RegisteredMessageImage) => {
    registry.current.set(image.id, image);
    return () => { registry.current.delete(image.id); };
  }, []);
  const open = useCallback((id: string) => {
    const images = [...registry.current.values()].filter(image => image.anchor.current?.isConnected === true);
    images.sort(compareImages);
    const initialIndex = images.findIndex(image => image.id === id);
    if (initialIndex !== -1) setOpened({ images, initialIndex });
  }, []);
  const context = useMemo(() => ({ register, open }), [register, open]);

  /** Discards the gallery snapshot so newly opened messages always get a fresh image list. */
  function handleClose(): void { setOpened(null); }

  let viewer = null;
  if (opened !== null) viewer = <ImageViewerDialog images={opened.images}
    initialIndex={opened.initialIndex} onClose={handleClose} />;
  return <MessageImageGalleryContext.Provider value={context}>{children}{viewer}</MessageImageGalleryContext.Provider>;
}
