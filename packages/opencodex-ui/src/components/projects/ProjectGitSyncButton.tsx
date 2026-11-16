import ArrowDownwardOutlinedIcon from "@mui/icons-material/ArrowDownwardOutlined";
import ArrowUpwardOutlinedIcon from "@mui/icons-material/ArrowUpwardOutlined";
import { CircularProgress, IconButton, Tooltip } from "@mui/material";

interface ProjectGitSyncButtonProps {
  direction: "push" | "pull";
  label: string;
  isLoading: boolean;
  disabled: boolean;
  onClick(): void;
}

/** Renders plain display props with a loading border that keeps the exchange arrow visible. */
export function ProjectGitSyncButton({ direction, label, isLoading, disabled, onClick }: ProjectGitSyncButtonProps) {
  const filled = direction === "push";
  const color = filled ? "common.white" : "primary.main";
  const backgroundColor = filled ? "primary.main" : "transparent";
  const hoverBackground = filled ? "primary.dark" : "action.hover";
  let disabledColor = "action.disabled";
  let disabledBackground = filled ? "action.disabledBackground" : "transparent";
  if (isLoading) {
    disabledColor = color;
    disabledBackground = backgroundColor;
  }
  let icon = <ArrowDownwardOutlinedIcon sx={{ fontSize: 16 }} />;
  if (filled) icon = <ArrowUpwardOutlinedIcon sx={{ fontSize: 16 }} />;
  let progress = null;
  if (isLoading) {
    progress = <CircularProgress aria-hidden="true" color="inherit" size={26} thickness={3}
      sx={{ position: "absolute", inset: 0, pointerEvents: "none" }} />;
  }

  return (
    <Tooltip title={label} disableInteractive>
      <span><IconButton size="small" aria-label={label} aria-busy={isLoading} onClick={onClick}
        disabled={disabled || isLoading} sx={{
          height: 26,
          width: 26,
          position: "relative",
          color,
          backgroundColor,
          "&:hover": { backgroundColor: hoverBackground },
          "&.Mui-disabled": { color: disabledColor, backgroundColor: disabledBackground }
        }}>
        {icon}
        {progress}
      </IconButton></span>
    </Tooltip>
  );
}
