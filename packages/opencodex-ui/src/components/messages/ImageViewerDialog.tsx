import { useId, useState, type KeyboardEvent } from "react";
import { Dialog } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { ViewerImage } from "./MessageImageGalleryContext";
import { ImageViewerContent } from "./ImageViewerContent";

interface ImageViewerDialogProps {
  images: readonly ViewerImage[];
  initialIndex: number;
  onClose(): void;
}

/** Owns bounded message navigation; remounting the content resets zoom and pending reads. */
export function ImageViewerDialog({ images, initialIndex, onClose }: ImageViewerDialogProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const [index, setIndex] = useState(initialIndex);
  const image = images[index];

  /** Moves only within the frozen list belonging to the opened message. */
  function handlePrevious(): void { setIndex(current => Math.max(0, current - 1)); }
  /** Stops at the final image rather than entering another message. */
  function handleNext(): void { setIndex(current => Math.min(images.length - 1, current + 1)); }
  /** Keeps navigation accessible while letting Escape use the dialog's native close behavior. */
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      handlePrevious();
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      handleNext();
    }
  }

  if (image === undefined) return null;
  return <Dialog open onClose={onClose} maxWidth={false} aria-labelledby={titleId}
    aria-label={t("message.imageViewer.title")} onKeyDown={handleKeyDown}
    slotProps={{ paper: { sx: { m: { xs: 1, sm: 2 }, width: "calc(100% - 16px)",
      maxWidth: "1600px", height: "calc(100dvh - 32px)", maxHeight: "calc(100dvh - 16px)", overflow: "hidden" } } }}>
    <ImageViewerContent key={image.id} image={image} index={index} count={images.length} titleId={titleId}
      onPrevious={handlePrevious} onNext={handleNext} onClose={onClose} />
  </Dialog>;
}
