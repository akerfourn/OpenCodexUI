import { Alert, Box, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

interface WorkspaceOperationErrorProps {
  message: string | null;
}

/** Explains the source-wide maintenance guard while retaining the original transport diagnostic. */
export function WorkspaceOperationError({ message }: WorkspaceOperationErrorProps) {
  const { t } = useTranslation();
  if (message === null) return null;
  let explanation = message;
  let details = null;
  if (message.endsWith("Finish active conversations and sub-agents on this source before workspace maintenance.")) {
    explanation = t("workspaces.sourceActive");
    details = <Box component="details" sx={{ mt: 1 }}>
      <Box component="summary" sx={{ cursor: "pointer" }}>{t("workspaces.errorDetails")}</Box>
      <Typography component="pre" variant="caption" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {message}
      </Typography>
    </Box>;
  }
  return <Alert severity="error"><Typography variant="body2">{explanation}</Typography>{details}</Alert>;
}
