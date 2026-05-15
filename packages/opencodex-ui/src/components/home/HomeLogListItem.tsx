/**
 * Renders one application log row.
 */
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { Box, IconButton, ListItem, ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexLogEntry } from "@open-codex-ui/opencodex-protocol";

type HomeLogListItemProps = {
  log: OpenCodexLogEntry;
  onDelete(logId: string): void;
  onOpen(log: OpenCodexLogEntry): void;
};

/**
 * Renders a compact single-line log row.
 *
 * @param props Component props.
 *
 * @returns Rendered log row.
 */
export function HomeLogListItem({ log, onDelete, onOpen }: HomeLogListItemProps) {
  const { t } = useTranslation();
  const createdAt = new Date(log.createdAt).toLocaleString();

  function handleDelete(): void {
    onDelete(log.id);
  }

  function handleOpen(): void {
    onOpen(log);
  }

  return (
    <ListItem
      disablePadding
      secondaryAction={(
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <Tooltip title={t("logs.details")}>
            <IconButton aria-label={t("logs.details")} edge="end" size="small" onClick={handleOpen}>
              <VisibilityOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={t("logs.delete")}>
            <IconButton aria-label={t("logs.delete")} edge="end" size="small" onClick={handleDelete}>
              <DeleteOutlineOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>
      )}
      sx={{ minHeight: 40, pr: 9 }}
    >
      <ListItemIcon sx={{ minWidth: 36 }}>
        {getLogIcon(log.type)}
      </ListItemIcon>
      <ListItemText
        primary={log.message}
        secondary={createdAt}
        slotProps={{
          primary: {
            noWrap: true,
            title: log.message
          }
        }}
      />
    </ListItem>
  );
}

function getLogIcon(type: OpenCodexLogEntry["type"]) {
  if (type === "error") {
    return <ReportProblemOutlinedIcon color="error" fontSize="small" />;
  }

  if (type === "warning") {
    return <WarningAmberOutlinedIcon color="warning" fontSize="small" />;
  }

  return <InfoOutlinedIcon color="info" fontSize="small" />;
}
