/**
 * Renders a compact command activity row.
 */
import { useState, type ReactNode } from "react";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTranslation } from "react-i18next";

import { CommandActivityDetailsDialog } from "./CommandActivityDetailsDialog";
import { readCommandActivityDetails } from "./commandActivityDetails";

type CommandActivityRowProps = {
  content: string;
  details?: string | null;
  icon: ReactNode;
};

/**
 * Renders a compact command activity row.
 *
 * @param props Component props.
 *
 * @returns Rendered command row.
 */
export function CommandActivityRow({ content, details, icon }: CommandActivityRowProps) {
  const { t } = useTranslation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const commandDetails = readCommandActivityDetails(content, details);
  const commandLabel = commandDetails.command.length > 0
    ? commandDetails.command
    : content;

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
          {commandLabel}
        </Typography>
        <Tooltip title={t("message.commandDetails")}>
          <IconButton
            aria-label={t("message.commandDetails")}
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
      </Box>
      <CommandActivityDetailsDialog
        open={isDialogOpen}
        details={commandDetails}
        onClose={handleCloseDetails}
      />
    </>
  );
}
