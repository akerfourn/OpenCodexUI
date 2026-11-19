import { useTheme } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";

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
  const theme = useTheme();
  const { language } = useFileHighlighting(document, languages);

  useEffect(() => {
    fileHighlighting.setTheme(theme.palette.mode);
  }, [theme.palette.mode]);

  const editor = document.viewMode === "diff" && document.gitDiffContext !== null ? (
    <MonacoFileDiffEditorX document={document} visible={visible} language={language} />
  ) : (
    <MonacoFileTextEditorX document={document} visible={visible} />
  );

  return <>{editor}</>;
}

export const MonacoFileEditorX = observer(MonacoFileEditor);
