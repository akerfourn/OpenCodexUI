import { useContext, useEffect, useState } from "react";
import { Box, Dialog, DialogContent, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";
import { ChatImageContext, type ChatImageContextValue } from "./ChatImageContext";
import { MarkdownLinkContext } from "./MarkdownLinkContext";
import { MarkdownLink } from "./MarkdownLink";
import { readDisplayImageUrl, readMarkdownImagePath } from "./markdownUrls";

interface ChatImageProps {
  src?: string;
  alt?: string;
  title?: string;
  compact?: boolean;
  localPath?: string;
  onOpen?(src: string, alt: string): void;
}

interface ImageResolution {
  original: string;
  context: ChatImageContextValue | null;
  url: string | null;
  error?: string;
}

/** Displays source-owned image bytes with zoom and a navigable unavailable-image fallback. */
export function ChatImage({ src = "", alt, title, compact = false, localPath, onOpen }: ChatImageProps) {
  const { t } = useTranslation();
  const context = useContext(ChatImageContext);
  const links = useContext(MarkdownLinkContext);
  const [resolution, setResolution] = useState<ImageResolution | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const label = alt ?? t("message.attachedImage");
  const directUrl = readDisplayImageUrl(src);
  const path = localPath ?? readMarkdownImagePath(src);
  const current = resolution?.original === src && resolution.context === context ? resolution : null;
  const imageUrl = current?.url ?? directUrl;
  const hasError = current?.error !== undefined;

  useEffect(() => {
    if (directUrl !== null || path === null || context === null) return;
    let isCancelled = false;
    context.loadImage(path).then((url) => {
      if (!isCancelled) setResolution({ original: src, context, url });
    }).catch((error: unknown) => {
      if (!isCancelled) setResolution({ original: src, context, url: null, error: String(error) });
    });
    return () => { isCancelled = true; };
  }, [src, directUrl, path, context]);

  /** Opens a decoded image in the shared attachment viewer or the inline zoom dialog. */
  function handleOpen(): void {
    if (imageUrl === null || hasError) return;
    if (onOpen !== undefined) onOpen(imageUrl, label);
    else setIsOpen(true);
  }

  /** Closes only this image's zoom view. */
  function handleClose(): void {
    setIsOpen(false);
  }

  /** Retains the source reference when decoding or loading fails. */
  function handleError(): void {
    setResolution({ original: src, context, url: null, error: t("message.imageUnavailable") });
  }

  if (imageUrl === null || hasError) {
    const onOpenLink = links?.onOpenLink ?? context?.onOpenLink;
    let fallback = <>{label}</>;
    if (path !== null && onOpenLink !== undefined) {
      fallback = <MarkdownLink href={src} onOpenLink={onOpenLink}
        requireModifiedClick={links?.requireModifiedClick ?? false}>{label}</MarkdownLink>;
    }
    return <Tooltip title={current?.error ?? t("message.imageUnavailable")}>
      <Box component="span" role="img" aria-label={t("message.imageUnavailable")}>{fallback}</Box>
    </Tooltip>;
  }

  let imageSize = { maxWidth: "100%", maxHeight: 480, width: "auto", height: "auto" };
  if (compact) imageSize = { maxWidth: "100%", maxHeight: 96, width: "132px", height: "96px" };
  return <>
    <Box component="button" type="button" aria-label={t("message.openImage")} onClick={handleOpen}
      sx={{ display: "inline-block", bgcolor: "transparent", border: 0, p: 0, cursor: "zoom-in", maxWidth: "100%" }}>
      <Box component="img" src={imageUrl} alt={label} title={title} loading="lazy" referrerPolicy="no-referrer"
        onError={handleError} sx={{ ...imageSize, display: "block", objectFit: "contain", borderRadius: 1 }} />
    </Box>
    <Dialog open={isOpen} maxWidth="lg" fullWidth onClose={handleClose}>
      <DialogContent>
        <Box component="img" src={imageUrl} alt={label}
          sx={{ display: "block", maxHeight: "80vh", maxWidth: "100%", mx: "auto", objectFit: "contain" }} />
      </DialogContent>
    </Dialog>
  </>;
}
