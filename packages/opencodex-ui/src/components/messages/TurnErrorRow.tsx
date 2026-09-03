/**
 * Displays a terminal error reported for a Codex turn.
 */
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import BugReportOutlinedIcon from "@mui/icons-material/BugReportOutlined";
import { Alert, Box, IconButton, Tooltip, Typography } from "@mui/material";
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

  return (
    <Box
      component="article"
      sx={{
        flex: "0 0 auto",
        minWidth: 0,
        px: 0.5,
        width: "100%",
        "@media (min-width: 1280px)": {
          maxWidth: "80%"
        }
      }}
    >
      <Alert
        severity="error"
        variant="outlined"
        icon={<ErrorOutlineOutlinedIcon fontSize="small" />}
        sx={{
          alignItems: "center",
          px: 1,
          py: 0.5,
          "& .MuiAlert-message": {
            minWidth: 0,
            overflowWrap: "anywhere",
            py: 0
          }
        }}
        action={diagnosticAction}
      >
        <Typography variant="body2">{message}</Typography>
      </Alert>
    </Box>
  );
}
