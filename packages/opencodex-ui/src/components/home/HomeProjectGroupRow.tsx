import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import FolderCopyOutlinedIcon from "@mui/icons-material/FolderCopyOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import {
  Box,
  IconButton,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography
} from "@mui/material";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectGroup } from "@open-codex-ui/opencodex-protocol";

import { getSourceColorOption } from "./sourceColor";

type HomeProjectGroupRowProps = {
  group: OpenCodexProjectGroup;
  editedAt: string;
  depth: number;
  childCount: number;
  onToggle(): void;
  onRename(): void;
  onDelete(): void;
};

/** Renders one expandable project group row. */
export function HomeProjectGroupRow({
  group,
  editedAt,
  depth,
  childCount,
  onToggle,
  onRename,
  onDelete
}: HomeProjectGroupRowProps) {
  const { i18n, t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  function handleOpenMenu(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  }

  function closeMenu(): void {
    setMenuAnchor(null);
  }

  function handleAction(action: () => void): void {
    closeMenu();
    action();
  }

  const childCountLabel = t(
    childCount === 1
      ? "home.projectGroupChildCount_one"
      : "home.projectGroupChildCount_other",
    { count: childCount }
  );
  const activityLabel = formatRelativeTime(editedAt, i18n.language);
  const colorOption = getSourceColorOption(group.color);

  return (
    <>
      <ListItemButton
        aria-expanded={!group.isCollapsed}
        onClick={onToggle}
        sx={{
          borderRadius: 1,
          mb: 0.5,
          pl: 1.5 + depth * 2
        }}
      >
        <ListItemIcon sx={{ minWidth: 30 }}>
          <ExpandMoreOutlinedIcon
            fontSize="small"
            sx={{ transform: group.isCollapsed ? "rotate(-90deg)" : "none" }}
          />
        </ListItemIcon>
        <FolderCopyOutlinedIcon
          fontSize="small"
          sx={{ color: colorOption.main, mr: 1 }}
        />
        <ListItemText
          primary={group.name}
          secondary={childCountLabel}
          slotProps={{
            primary: { sx: { fontWeight: 600 }, noWrap: true },
            secondary: { noWrap: true }
          }}
        />
        <Box
          sx={{
            alignItems: "center",
            display: "flex",
            flex: "0 0 150px",
            justifyContent: "flex-end",
            ml: 1
          }}
        >
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ flex: "1 1 auto", textAlign: "right" }}
          >
            {activityLabel}
          </Typography>
          <IconButton
            aria-label={t("home.projectGroupActions")}
            size="small"
            onClick={handleOpenMenu}
            sx={{ flex: "0 0 auto", ml: 0.5 }}
          >
            <MoreVertOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
      </ListItemButton>
      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={closeMenu}>
        <MenuItem onClick={() => handleAction(onRename)}>
          <EditOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
          {t("home.editProjectGroup")}
        </MenuItem>
        <MenuItem onClick={() => handleAction(onDelete)}>
          <DeleteOutlineOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
          {t("home.deleteProjectGroup")}
        </MenuItem>
      </Menu>
    </>
  );
}

/** Formats a group activity timestamp for the current locale. */
function formatRelativeTime(value: string, language: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return "";
  }

  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  const units: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
    { unit: "year", seconds: 31_536_000 },
    { unit: "month", seconds: 2_592_000 },
    { unit: "week", seconds: 604_800 },
    { unit: "day", seconds: 86_400 },
    { unit: "hour", seconds: 3_600 },
    { unit: "minute", seconds: 60 },
    { unit: "second", seconds: 1 }
  ];
  const matchingUnit = units.find((entry) => absoluteSeconds >= entry.seconds) ?? units.at(-1);
  if (matchingUnit === undefined) {
    return "";
  }

  return new Intl.RelativeTimeFormat(language, { numeric: "always", style: "long" })
    .format(Math.round(seconds / matchingUnit.seconds), matchingUnit.unit);
}
