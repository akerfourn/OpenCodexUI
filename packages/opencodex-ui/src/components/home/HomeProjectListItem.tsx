/**
 * Renders one project entry in the Home project list.
 */
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import DriveFileMoveOutlinedIcon from "@mui/icons-material/DriveFileMoveOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import {
  Box,
  IconButton,
  ListItemButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Typography
} from "@mui/material";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexProject, OpenCodexSourceColor } from "@open-codex-ui/opencodex-protocol";

import { getSourceBadgeSx } from "./sourceColor";

type HomeProjectListItemProps = {
  project: OpenCodexProject;
  depth: number;
  sourceName: string | null;
  sourceColor: OpenCodexSourceColor | null;
  onOpen(projectPath: string, sourceId: string | null): void;
  onSetHidden(projectId: string, isHidden: boolean): void;
  onDelete(project: OpenCodexProject): void;
  onOrganize(project: OpenCodexProject): void;
};

/**
 * Renders one project list item.
 *
 * @param props Component props.
 *
 * @returns Rendered project item.
 */
export function HomeProjectListItem({
  project,
  depth,
  sourceName,
  sourceColor,
  onOpen,
  onSetHidden,
  onDelete,
  onOrganize
}: HomeProjectListItemProps) {
  const { i18n, t } = useTranslation();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const projectName = project.displayName ?? project.defaultName;
  const sourceLabel = sourceName ?? t("sources.orphan");
  const relativeEditedAt = formatRelativeTime(project.editedAt, i18n.language);
  const hiddenButtonLabel = project.isHidden ? t("home.showProject") : t("home.hideProject");

  function handleOpen(): void {
    onOpen(project.path, project.sourceId);
  }

  function handleSetHidden(): void {
    onSetHidden(project.id, !project.isHidden);
  }

  function handleDelete(): void {
    onDelete(project);
  }

  function handleOpenMenu(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
  }

  function closeMenu(): void {
    setMenuAnchor(null);
  }

  function handleMenuAction(action: () => void): void {
    closeMenu();
    action();
  }

  return (
    <>
      <ListItemButton
        className="home-project-list-item"
        onClick={handleOpen}
        sx={{ borderRadius: 1, mb: 0.5, pl: 1.5 + depth * 2 }}
      >
      <ListItemIcon sx={{ minWidth: 34 }}>
        <FolderOutlinedIcon fontSize="small" />
      </ListItemIcon>
      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Typography
            variant="caption"
            component="span"
            noWrap
            sx={[
              getSourceBadgeSx(sourceColor),
              {
                borderRadius: 999,
                flex: "0 0 auto",
                lineHeight: 1.4,
                maxWidth: 160,
                px: 0.75,
                py: 0.125
              }
            ]}
          >
            {sourceLabel}
          </Typography>
          <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
            {projectName}
          </Typography>
        </Box>
        <Typography variant="caption" component="div" color="text.secondary" noWrap>
          {project.path}
        </Typography>
      </Box>
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
          {relativeEditedAt}
        </Typography>
        <IconButton
          aria-label={t("home.projectActions")}
          size="small"
          onClick={handleOpenMenu}
          sx={{ flex: "0 0 auto", ml: 0.5 }}
        >
          <MoreVertOutlinedIcon fontSize="small" />
        </IconButton>
      </Box>
      </ListItemButton>
      <Menu anchorEl={menuAnchor} open={menuAnchor !== null} onClose={closeMenu}>
        <MenuItem onClick={() => handleMenuAction(() => onOrganize(project))}>
          <DriveFileMoveOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
          {t("home.organizeProjectAction")}
        </MenuItem>
        <MenuItem onClick={() => handleMenuAction(handleSetHidden)}>
          {project.isHidden ? (
            <VisibilityOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
          ) : (
            <VisibilityOffOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
          )}
          {hiddenButtonLabel}
        </MenuItem>
        <MenuItem onClick={() => handleMenuAction(handleDelete)}>
          <DeleteOutlineOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
          {t("home.deleteProjectFromCache")}
        </MenuItem>
      </Menu>
    </>
  );
}

/**
 * Formats a timestamp as a relative time label.
 *
 * @param value ISO timestamp.
 * @param language Current UI language.
 *
 * @returns Relative time label.
 */
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
  const fallbackUnit = units[units.length - 1];
  const matchingUnit = units.find((entry) => absoluteSeconds >= entry.seconds) ?? fallbackUnit;

  if (matchingUnit === undefined) {
    return "";
  }

  const amount = Math.round(seconds / matchingUnit.seconds);
  const formatter = new Intl.RelativeTimeFormat(language, {
    numeric: "always",
    style: "long"
  });

  return formatter.format(amount, matchingUnit.unit);
}
