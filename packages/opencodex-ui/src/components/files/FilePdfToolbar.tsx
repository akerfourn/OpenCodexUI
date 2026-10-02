import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { Button, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import NavigateBefore from "@mui/icons-material/NavigateBefore";
import NavigateNext from "@mui/icons-material/NavigateNext";
import ViewDay from "@mui/icons-material/ViewDay";
import ZoomIn from "@mui/icons-material/ZoomIn";
import ZoomOut from "@mui/icons-material/ZoomOut";
import { useTranslation } from "react-i18next";
import type { FileDocument } from "../../stores/files/FileDocument";

/** Retains navigation in document state instead of tying it to the mounted PDF renderer. */
export function FilePdfToolbar({ document, pageCount, scale }: { document: FileDocument; pageCount: number; scale: number }) {
  const { t } = useTranslation();
  /** Moves to an existing page only. */
  function changePage(delta: number): void {
    runInAction(() => {
      document.pdfPage = Math.max(1, Math.min(pageCount, document.pdfPage + delta));
      document.pdfPageOffset = 0;
    });
  }
  /** Applies a bounded, explicit scale; fitting remains a separate mode. */
  function zoom(factor: number): void {
    runInAction(() => { document.pdfZoom = Math.max(0.25, Math.min(4, scale * factor)); });
  }
  /** Restores automatic fitting to the panel width. */
  function fit(): void {
    runInAction(() => { document.pdfZoom = null; });
  }
  /** Keeps the reading mode with this document while retaining the current page. */
  function toggleContinuous(): void {
    runInAction(() => { document.pdfContinuous = !document.pdfContinuous; });
  }
  const label = document.pdfZoom === null ? t("files.pdfFitWidth") : `${Math.round(document.pdfZoom * 100)} %`;
  return (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", px: 1, py: 0.5, flexShrink: 0 }}>
      <Tooltip title={t("files.pdfPrevious")}><span>
        <IconButton aria-label={t("files.pdfPrevious")} size="small" disabled={pageCount === 0 || document.pdfPage <= 1}
          onClick={() => changePage(-1)}><NavigateBefore /></IconButton>
      </span></Tooltip>
      <Typography variant="caption">{t("files.pdfPage", { page: document.pdfPage, total: pageCount })}</Typography>
      <Tooltip title={t("files.pdfNext")}><span>
        <IconButton aria-label={t("files.pdfNext")} size="small" disabled={pageCount === 0 || document.pdfPage >= pageCount}
          onClick={() => changePage(1)}><NavigateNext /></IconButton>
      </span></Tooltip>
      <Tooltip title={t("files.imageZoomOut")}><span>
        <IconButton aria-label={t("files.imageZoomOut")} size="small" disabled={pageCount === 0 || document.pdfZoom === 0.25}
          onClick={() => zoom(0.8)}><ZoomOut /></IconButton>
      </span></Tooltip>
      <Typography variant="caption">{label}</Typography>
      <Tooltip title={t("files.imageZoomIn")}><span>
        <IconButton aria-label={t("files.imageZoomIn")} size="small" disabled={pageCount === 0 || document.pdfZoom === 4}
          onClick={() => zoom(1.25)}><ZoomIn /></IconButton>
      </span></Tooltip>
      <Tooltip title={t("files.pdfContinuous")}>
        <IconButton size="small" aria-label={t("files.pdfContinuous")} aria-pressed={document.pdfContinuous}
          color={document.pdfContinuous ? "primary" : "default"} onClick={toggleContinuous}>
          <ViewDay />
        </IconButton>
      </Tooltip>
      <Button size="small" onClick={fit} disabled={pageCount === 0}>{t("files.pdfFitWidth")}</Button>
    </Stack>
  );
}
export const FilePdfToolbarX = observer(FilePdfToolbar);
