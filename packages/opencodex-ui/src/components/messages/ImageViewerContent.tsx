import { useEffect, useState } from "react";
import { Box, Button, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import CloseIcon from "@mui/icons-material/Close";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import { useTranslation } from "react-i18next";
import { useApplicationErrorReporter } from "../app/applicationErrorContext";
import type { ViewerImage } from "./MessageImageGalleryContext";
import { readDisplayImageUrl } from "./markdownUrls";
import { useImageViewport } from "./useImageViewport";
import { ImageUnavailableError } from "../../stores/files/ImageUnavailableError";
import { UnavailableImage } from "./UnavailableImage";

interface ImageViewerContentProps {
  image: ViewerImage;
  index: number;
  count: number;
  titleId: string;
  onPrevious(): void;
  onNext(): void;
  onClose(): void;
}

/** Displays one source-owned image with zoom, bounded dragging and always reachable navigation. */
export function ImageViewerContent({ image, index, count, titleId, onPrevious, onNext, onClose }: ImageViewerContentProps) {
  const { t } = useTranslation();
  const reportError = useApplicationErrorReporter();
  const viewport = useImageViewport();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    image.load().then(url => {
      if (cancelled) return;
      if (readDisplayImageUrl(url) === null) throw new Error(t("message.imageUnavailable"));
      setSrc(url);
    }).catch((error: unknown) => {
      if (cancelled) return;
      setFailed(true);
      if (!(error instanceof ImageUnavailableError)) reportError(error, t("message.imageViewer.title"));
    });
    return () => { cancelled = true; };
  }, [image, attempt, reportError, t]);

  /** Browser image failures are an unavailable preview, not a repeated application error. */
  function handleImageError(): void {
    setFailed(true);
  }
  /** Allows a source that became available again to be read without closing the gallery. */
  function handleRetry(): void { setAttempt(current => current + 1); }

  let imageContent = null;
  if (src !== null && !failed) imageContent = <Box component="img" src={src} alt={image.alt}
    draggable={false} referrerPolicy="no-referrer" onLoad={viewport.onLoad} onError={handleImageError}
    sx={{ position: "absolute", left: "50%", top: "50%", width: viewport.image.width || "auto",
      height: viewport.image.height || "auto", maxWidth: "none", maxHeight: "none", userSelect: "none",
      pointerEvents: "none", visibility: viewport.isReady ? "visible" : "hidden", transformOrigin: "center",
      transform: `translate(-50%, -50%) translate(${viewport.transform.x}px, ${viewport.transform.y}px) scale(${viewport.transform.scale})` }} />;
  let pendingContent = null;
  if (!failed && (!viewport.isReady || src === null)) pendingContent = <CircularProgress
    aria-label={t("message.imageViewer.loading")} size={32} sx={{ position: "absolute", left: "calc(50% - 16px)", top: "calc(50% - 16px)" }} />;
  if (failed) pendingContent = <Box sx={{ position: "absolute", left: "50%", top: "50%",
    transform: "translate(-50%, -50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
    <UnavailableImage label={image.alt} />
    <Button onClick={handleRetry}>{t("files.retry")}</Button>
  </Box>;
  let navigation = null;
  if (count > 1) navigation = <>
    <IconButton aria-label={t("message.imageViewer.previous")} disabled={index === 0} onClick={onPrevious}
      sx={{ position: "absolute", left: 8, top: "calc(50% - 22px)", bgcolor: "background.paper",
        "&:hover": { bgcolor: "action.selected" } }}><ChevronLeftIcon /></IconButton>
    <IconButton aria-label={t("message.imageViewer.next")} disabled={index === count - 1} onClick={onNext}
      sx={{ position: "absolute", right: 8, top: "calc(50% - 22px)", bgcolor: "background.paper",
        "&:hover": { bgcolor: "action.selected" } }}><ChevronRightIcon /></IconButton>
  </>;
  const zoomDisabled = !viewport.isReady || failed || src === null;
  return <>
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5, p: 1,
      borderBottom: 1, borderColor: "divider" }}>
      <Typography id={titleId} noWrap sx={{ flex: "1 1 100px", minWidth: 0, px: 1 }} title={image.alt}>{image.alt}</Typography>
      <Typography variant="caption" aria-live="polite" sx={{ px: 1 }}>{index + 1} / {count}</Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, justifyContent: "center",
        order: { xs: 1, sm: 0 }, width: { xs: "100%", sm: "auto" } }}>
        <Tooltip title={t("files.imageZoomOut")} disableInteractive><span>
          <IconButton aria-label={t("files.imageZoomOut")} onClick={viewport.zoomOut}
            disabled={zoomDisabled || !viewport.canZoomOut}><ZoomOutIcon /></IconButton>
        </span></Tooltip>
        <Typography variant="caption" sx={{ minWidth: 42, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
          {Math.round(viewport.transform.scale * 100)}%
        </Typography>
        <Tooltip title={t("files.imageZoomIn")} disableInteractive><span>
          <IconButton aria-label={t("files.imageZoomIn")} onClick={viewport.zoomIn}
            disabled={zoomDisabled || !viewport.canZoomIn}><ZoomInIcon /></IconButton>
        </span></Tooltip>
        <Button size="small" disabled={zoomDisabled} onClick={viewport.fit}>{t("files.imageFit")}</Button>
        <Button size="small" disabled={zoomDisabled} onClick={viewport.actualSize}>{t("files.imageActualSize")}</Button>
      </Box>
      <Tooltip title={t("message.imageViewer.close")} disableInteractive>
        <IconButton aria-label={t("message.imageViewer.close")} onClick={onClose}><CloseIcon /></IconButton>
      </Tooltip>
    </Box>
    <Box sx={{ position: "relative", flex: "1 1 auto", minHeight: 0, bgcolor: "action.hover" }}>
      <Box ref={viewport.ref} data-image-viewport onPointerDown={viewport.onPointerDown}
        onPointerMove={viewport.onPointerMove} onPointerUp={viewport.onPointerEnd}
        onPointerCancel={viewport.onPointerEnd} onLostPointerCapture={viewport.onPointerEnd}
        onDoubleClick={viewport.toggleZoom}
        sx={{ position: "absolute", inset: 0, overflow: "hidden", touchAction: "none",
          cursor: viewport.isDragging ? "grabbing" : "grab" }}>{imageContent}</Box>
      {pendingContent}{navigation}
    </Box>
    <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.75, textAlign: "center" }}>
      {t("message.imageViewer.hint")}
    </Typography>
  </>;
}
