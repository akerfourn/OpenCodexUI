import { Alert, Box } from "@mui/material";
import { useTranslation } from "react-i18next";
import { observer } from "mobx-react-lite";
import type { FileDocumentError } from "../../stores/files/FileDocument";

/** Localized failure with expandable technical details, never replacing the buffer. */
export function FileError({ error }: { error: FileDocumentError }) {
  const { t } = useTranslation();
  return (
    <Alert severity="error" sx={{ m: 1 }}>
      {t(`files.errors.${error.code}`)}
      <Box component="details" sx={{ mt: 0.5, overflowWrap: "anywhere" }}>
        <summary>{t("files.details")}</summary>
        {error.details}
      </Box>
    </Alert>
  );
}
export const FileErrorX = observer(FileError);
