/**
 * Renders one project entry in the Home project list.
 */
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { Box, ListItemButton, ListItemIcon, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexProject } from "@open-codex-ui/opencodex-protocol";

type HomeProjectListItemProps = {
  project: OpenCodexProject;
  onOpen(projectPath: string): void;
};

/**
 * Renders one project list item.
 *
 * @param props Component props.
 *
 * @returns Rendered project item.
 */
export function HomeProjectListItem({ project, onOpen }: HomeProjectListItemProps) {
  const { i18n } = useTranslation();
  const projectName = project.displayName ?? project.defaultName;
  const relativeEditedAt = formatRelativeTime(project.editedAt, i18n.language);

  function handleOpen(): void {
    onOpen(project.path);
  }

  return (
    <ListItemButton onClick={handleOpen} sx={{ borderRadius: 1, mb: 0.5 }}>
      <ListItemIcon sx={{ minWidth: 34 }}>
        <FolderOutlinedIcon fontSize="small" />
      </ListItemIcon>
      <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
        <Typography variant="body2" noWrap>
          {projectName}
        </Typography>
        <Typography variant="caption" component="div" color="text.secondary" noWrap>
          {project.path}
        </Typography>
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ flex: "0 0 auto", ml: 2 }}>
        {relativeEditedAt}
      </Typography>
    </ListItemButton>
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
