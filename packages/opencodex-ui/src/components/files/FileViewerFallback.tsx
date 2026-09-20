import { Alert, Box } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { FileDocument } from "../../stores/files/FileDocument";

/** A viewer failure still leaves the user's full buffer available to copy or save. */
export function FileViewerFallback({ document }: { document: FileDocument }) {
  const { t } = useTranslation();
  return (
    <>
      <Alert severity="error">{t("files.viewerFailed")}</Alert>
      <Box
        component="textarea"
        readOnly
        aria-label={document.name}
        value={document.content}
        sx={{ flex: 1, minHeight: 100, color: "text.primary", bgcolor: "background.default" }}
      />
    </>
  );
}
export const FileViewerFallbackX = observer(FileViewerFallback);
