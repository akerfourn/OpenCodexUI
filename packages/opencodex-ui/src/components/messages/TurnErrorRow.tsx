/**
 * Displays a terminal error reported for a Codex turn.
 */
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import { Box, IconButton, Tooltip, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

type TurnErrorRowProps = {
  message: string;
  showTurnDiagnostic?: boolean;
  onOpenTurnDiagnostic?(): void;
};

/**
 * Renders a compact, high-contrast turn error.
 *
 * @param props Error row properties.
 * @returns Rendered error row.
 */
export function TurnErrorRow({
  message,
  showTurnDiagnostic = false,
  onOpenTurnDiagnostic
}: TurnErrorRowProps) {
  const { t } = useTranslation();
  const diagnosticAction = showTurnDiagnostic && onOpenTurnDiagnostic !== undefined ? (
    <Tooltip title={t("turnDiagnostics.title")}>
      <IconButton
        aria-label={t("turnDiagnostics.title")}
        size="small"
        onClick={onOpenTurnDiagnostic}
        sx={{ color: "inherit", ml: 0.5 }}
      >
        <BugReportOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  ) : undefined;

  return <Box component="article" sx={{ display: "flex", alignItems: "center", gap: 0.5, px: 1.5 }}>
    <ErrorOutlineOutlinedIcon fontSize="small" color="error" />
    <Typography variant="caption" color="text.secondary">{t("message.turnFailed")}</Typography>
    {diagnosticAction}
  </Box>;
}
