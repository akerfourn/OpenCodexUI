import { Alert, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

/** Keeps dictation failures local to the control, with selectable diagnostic details. */
export function DictationError({ message, onClose }: { message: string | null; onClose?: () => void }) {
  const { t } = useTranslation();
  if (message === null) return null;
  return (
    <Alert severity="error" onClose={onClose}>
      {t("dictation.failed")}
      <details>
        <summary>{t("dictation.details")}</summary>
        <Typography component="pre" variant="caption" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", userSelect: "text" }}>{message}</Typography>
      </details>
    </Alert>
  );
}
