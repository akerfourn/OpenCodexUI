/**
 * Renders one application log row.
 */
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import { Box, IconButton, ListItem, ListItemIcon, ListItemText, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
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
  const sessionIndicator = log.storage === "session" ? (
    <Tooltip title={t("logs.sessionTooltip")}>
      <Box
        component="span"
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: 0.75,
          color: "text.secondary",
          fontSize: "0.7rem",
          lineHeight: 1.4,
          px: 0.5
        }}
      >
        {t("logs.session")}
      </Box>
    </Tooltip>
  ) : null;

  function handleDelete(): void {
    onDelete(log.id);
  }

  function handleOpen(): void {
    onOpen(log);
  }

  const secondaryContent = (
    <Box component="span" sx={{ alignItems: "center", display: "inline-flex", gap: 0.75 }}>
      <Box component="span">{createdAt}</Box>
      {sessionIndicator}
    </Box>
  );

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
        secondary={secondaryContent}
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

export const HomeLogListItemX = observer(HomeLogListItem);

function getLogIcon(type: OpenCodexLogEntry["type"]) {
  if (type === "error") {
    return <ReportProblemOutlinedIcon color="error" fontSize="small" />;
  }

  if (type === "warning") {
    return <WarningAmberOutlinedIcon color="warning" fontSize="small" />;
  }

  return <InfoOutlinedIcon color="info" fontSize="small" />;
}
