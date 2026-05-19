/**
 * Renders a compact file-change activity row.
 */
import { useState, type ReactNode } from "react";
import { Box, Dialog, DialogContent, DialogTitle, IconButton, Tooltip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTranslation } from "react-i18next";

import { CommandDetailBlock } from "./CommandDetailBlock";

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
  const hasDetails = details !== null && details !== undefined && details.trim().length > 0;

  function handleOpenDetails(): void {
    setIsDialogOpen(true);
  }

  function handleCloseDetails(): void {
    setIsDialogOpen(false);
  }

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
      <Dialog open={isDialogOpen} fullWidth maxWidth="lg" onClose={handleCloseDetails}>
        <DialogTitle>{t("message.fileChangeDetails")}</DialogTitle>
        <DialogContent dividers sx={{ maxHeight: "75vh", overflow: "auto" }}>
          <CommandDetailBlock
            label={t("message.fileChangeDiff")}
            value={details ?? ""}
            emptyLabel={t("message.fileChangeDiffUnavailable")}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
