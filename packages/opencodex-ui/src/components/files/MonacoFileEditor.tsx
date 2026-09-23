import { Alert, useTheme } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { FileDocument } from "../../stores/files/FileDocument";
import type { FileLanguagesStore } from "../../stores/files/FileLanguagesStore";
import { fileHighlighting } from "./monacoRuntime";
import { useFileHighlighting } from "./useFileHighlighting";
import { MonacoFileDiffEditorX } from "./MonacoFileDiffEditor";
import { MonacoFileTextEditorX } from "./MonacoFileTextEditor";

type MonacoFileEditorProps = {
  document: FileDocument;
  visible: boolean;
  languages: FileLanguagesStore;
};

/** Selects a focused Monaco view while retaining shared document state. */
export function MonacoFileEditor({ document, visible, languages }: MonacoFileEditorProps) {
  const { t } = useTranslation();
  const theme = useTheme();
  const { error: highlightingError, language } = useFileHighlighting(document, languages);

  useEffect(() => {
    fileHighlighting.setTheme(theme.palette.mode);
  }, [theme.palette.mode]);

  const feedback = highlightingError === null ? null : (
    <Alert severity="warning">
      {t("fileLanguages.loadError")}
      <details>
        <summary>{t("fileLanguages.details")}</summary>
        {highlightingError}
      </details>
    </Alert>
  );
  const editor = document.viewMode === "diff" && document.gitDiffContext !== null ? (
    <MonacoFileDiffEditorX document={document} visible={visible} language={language} />
  ) : (
    <MonacoFileTextEditorX document={document} visible={visible} />
  );

  return <>{feedback}{editor}</>;
}

export const MonacoFileEditorX = observer(MonacoFileEditor);
