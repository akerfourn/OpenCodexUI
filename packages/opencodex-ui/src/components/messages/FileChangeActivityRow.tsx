/**
 * Renders a compact file-change activity row.
 */
import { useState, type MouseEvent, type ReactNode } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTranslation } from "react-i18next";

import { CommandDetailBlock } from "./CommandDetailBlock";
import { FileChangeDiffViewer } from "./FileChangeDiffViewer";
import { parseFileChangeDiff, type FileChangeDiffData } from "./fileChangeDiff";

type FileChangeActivityRowProps = {
  content: string;
  details?: string | null;
  icon: ReactNode;
};

/**
 * Renders a compact file-change activity row.
 *
 * @param props Component props.
 *
 * @returns Rendered row.
 */
export function FileChangeActivityRow({ content, details, icon }: FileChangeActivityRowProps) {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRawView, setIsRawView] = useState(false);
  const [parsedDiff, setParsedDiff] = useState<FileChangeDiffData | null>(null);
  const hasDetails = details !== null && details !== undefined && details.trim().length > 0;

  function handleOpenDetails(): void {
    const rawDetails = details ?? "";

    setParsedDiff(parseFileChangeDiff(rawDetails));
    setIsRawView(false);
    setIsDialogOpen(true);
  }

  function handleCloseDetails(): void {
    setIsDialogOpen(false);
  }

  function handleViewChange(
    _event: MouseEvent<HTMLElement>,
    value: "visual" | "raw" | null
  ): void {
    if (value === null) {
      return;
    }

    setIsRawView(value === "raw");
  }

  const canRenderVisualDiff = parsedDiff !== null;
  const shouldShowRawView = isRawView || !canRenderVisualDiff;

  return (
    <>
      <Box
        sx={{
          alignItems: "center",
          display: "flex",
          gap: 1,
          minWidth: 0,
          width: "100%"
        }}
      >
        {icon}
        <Typography
          variant="body2"
          noWrap
          sx={{
            flex: "1 1 auto",
            fontStyle: "italic",
            minWidth: 0
          }}
        >
          {content}
        </Typography>
        {hasDetails ? (
          <Tooltip title={t("message.fileChangeDetails")}>
            <IconButton
              aria-label={t("message.fileChangeDetails")}
              size="small"
              onClick={handleOpenDetails}
              sx={{
                color: "text.secondary",
                flex: "0 0 auto",
                height: 24,
                p: 0.25,
                width: 24
              }}
            >
              <InfoOutlinedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        ) : null}
      </Box>
      {isDialogOpen ? (
        <Dialog open fullWidth maxWidth="xl" onClose={handleCloseDetails}>
          <DialogTitle>{t("message.fileChangeDetails")}</DialogTitle>
          <DialogContent dividers sx={{ maxHeight: "75vh", overflow: "auto" }}>
            {canRenderVisualDiff ? (
              <ToggleButtonGroup
                exclusive
                size="small"
                value={shouldShowRawView ? "raw" : "visual"}
                onChange={handleViewChange}
                sx={{ mb: 1.5 }}
              >
                <ToggleButton value="visual">
                  {t("message.fileChangeVisualView")}
                </ToggleButton>
                <ToggleButton value="raw">
                  {t("message.fileChangeRawView")}
                </ToggleButton>
              </ToggleButtonGroup>
            ) : null}
            {shouldShowRawView ? (
              <CommandDetailBlock
                label={t("message.fileChangeRawData")}
                value={details ?? ""}
                emptyLabel={t("message.fileChangeDiffUnavailable")}
                previewStrategy="head-tail"
              />
            ) : parsedDiff !== null ? (
              <FileChangeDiffViewer data={parsedDiff} />
            ) : null}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDetails}>{t("message.close")}</Button>
          </DialogActions>
        </Dialog>
      ) : null}
    </>
  );
}
