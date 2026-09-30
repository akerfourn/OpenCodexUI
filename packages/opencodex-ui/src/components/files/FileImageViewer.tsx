import { useRef, useState, type SyntheticEvent } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import ZoomIn from "@mui/icons-material/ZoomIn";
import ZoomOut from "@mui/icons-material/ZoomOut";
import { useTranslation } from "react-i18next";
import type { FileDocument } from "../../stores/files/FileDocument";

/** Displays source-owned image bytes with a retained zoom and no filesystem URLs. */
export function FileImageViewer({ document }: { document: FileDocument }) {
  const { t } = useTranslation();
  const imageRef = useRef<HTMLImageElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [hasError, setHasError] = useState(false);
  const snapshot = document.imageSnapshot;
  const zoom = document.imageZoom;

  /** Records decoded dimensions without treating corrupt bytes as a transport failure. */
  function handleLoad(event: SyntheticEvent<HTMLImageElement>): void {
    const image = event.currentTarget;
    setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
    setHasError(false);
  }

  /** Leaves reload and external opening available when the browser cannot decode an image. */
  function handleError(): void {
    setHasError(true);
  }

  /** Fits the complete image inside the available viewport. */
  function fit(): void {
    document.setImageZoom(null);
  }

  /** Shows one image pixel per CSS pixel. */
  function actualSize(): void {
    document.setImageZoom(1);
  }

  /** Starts zooming from the current fitted scale, then bounds manual magnification. */
  function changeZoom(factor: number): void {
    const image = imageRef.current;
    if (image === null || dimensions.width === 0) return;
    const bounds = image.getBoundingClientRect();
    const fittedZoom = Math.min(bounds.width / dimensions.width, bounds.height / dimensions.height);
    const currentZoom = zoom ?? fittedZoom;
    document.setImageZoom(Math.min(8, Math.max(0.1, currentZoom * factor)));
  }

  /** Reduces the currently displayed scale. */
  function zoomOut(): void {
    changeZoom(0.8);
  }

  /** Increases the currently displayed scale. */
  function zoomIn(): void {
    changeZoom(1.25);
  }

  if (snapshot === null) return null;
  if (hasError) return <Alert severity="error">{t("files.imageDecodeError")}</Alert>;

  const isLoaded = dimensions.width > 0;
  const size = isLoaded ? `${dimensions.width} × ${dimensions.height}` : "";
  const scale = zoom === null ? t("files.imageFit") : `${Math.round(zoom * 100)} %`;
  const imageStyle = zoom === null || !isLoaded ? undefined : {
    width: dimensions.width * zoom,
    height: dimensions.height * zoom
  };

  return (
    <div className="files-image-viewer">
      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", px: 1, py: 0.5 }}>
        <Tooltip title={t("files.imageZoomOut")}>
          <span><IconButton size="small" aria-label={t("files.imageZoomOut")} onClick={zoomOut}
            disabled={!isLoaded || (zoom !== null && zoom <= 0.1)}><ZoomOut /></IconButton></span>
        </Tooltip>
        <Typography variant="caption" sx={{ minWidth: 60, textAlign: "center" }}>{scale}</Typography>
        <Tooltip title={t("files.imageZoomIn")}>
          <span><IconButton size="small" aria-label={t("files.imageZoomIn")} onClick={zoomIn}
            disabled={!isLoaded || (zoom !== null && zoom >= 8)}><ZoomIn /></IconButton></span>
        </Tooltip>
        <Button size="small" onClick={fit} aria-pressed={zoom === null}>{t("files.imageFit")}</Button>
        <Button size="small" onClick={actualSize} aria-pressed={zoom === 1}>{t("files.imageActualSize")}</Button>
        <Typography variant="caption" color="text.secondary" sx={{ flex: 1, textAlign: "right" }}>{size}</Typography>
      </Stack>
      <div className="files-image-viewport">
        <div className="files-image-canvas" data-fit={zoom === null || !isLoaded}>
          <img ref={imageRef} src={snapshot.dataUrl} alt={document.name} draggable={false}
            style={imageStyle} onLoad={handleLoad} onError={handleError} />
        </div>
      </div>
    </div>
  );
}

export const FileImageViewerX = observer(FileImageViewer);
