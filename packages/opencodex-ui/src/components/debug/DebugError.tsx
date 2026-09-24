import { Alert, Box } from "@mui/material";
import { useTranslation } from "react-i18next";

/** Keeps raw adapter diagnostics available without letting a stack trace fill the panel. */
export function DebugError({ details, onClose }: { details: string; onClose?: () => void }) {
  const { t } = useTranslation();
  return <Alert severity="error" onClose={onClose}>
    {t("debug.error")}
    <details><summary>{t("debug.details")}</summary>
      <Box component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 180, overflow: "auto", fontSize: 12 }}>{details}</Box>
    </details>
  </Alert>;
}
