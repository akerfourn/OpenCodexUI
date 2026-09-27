import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { FileDocument } from "../../stores/files/FileDocument";
import type { FileDiffLayout, FileViewMode } from "../../stores/files/fileOpenIntent";

/** Keeps document presentation and Git comparison choices in one compact control. */
export function FileDocumentViewControls({ document }: { document: FileDocument }) {
  const { t } = useTranslation();
  /** Selects a presentation without replacing the editor's retained document model. */
  function changeView(_event: MouseEvent<HTMLElement>, value: FileViewMode | "preview" | null): void {
    if (value === null) return;
    if (value === "diff") document.setViewMode("diff");
    else document.setMarkdownPreview(value === "preview");
  }
  /** Applies a Monaco diff layout choice to this document only. */
  function changeLayout(_event: MouseEvent<HTMLElement>, value: FileDiffLayout | null): void {
    if (value !== null) document.setDiffLayout(value);
  }
  const preview = document.canPreviewMarkdown
    ? <ToggleButton value="preview">{t("files.viewPreview")}</ToggleButton> : null;
  const diff = document.gitDiffContext !== null
    ? <ToggleButton value="diff">{t("files.viewDiff")}</ToggleButton> : null;
  const controls = document.canPreviewMarkdown || document.gitDiffContext !== null ? (
    <ToggleButtonGroup exclusive size="small" aria-label={t("files.viewMode")}
      value={document.isMarkdownPreview ? "preview" : document.viewMode} onChange={changeView}>
      <ToggleButton value="file">{t(document.canPreviewMarkdown ? "files.viewSource" : "files.viewFile")}</ToggleButton>
      {preview}
      {diff}
    </ToggleButtonGroup>
  ) : null;
  const layout = document.viewMode === "diff" && document.gitDiffContext !== null ? (
    <ToggleButtonGroup exclusive size="small" value={document.diffLayout}
      aria-label={t("files.diffLayout")} onChange={changeLayout}>
      <ToggleButton value="side-by-side">{t("files.diffSideBySide")}</ToggleButton>
      <ToggleButton value="inline">{t("files.diffInline")}</ToggleButton>
    </ToggleButtonGroup>
  ) : null;
  return <>{controls}{layout}</>;
}
export const FileDocumentViewControlsX = observer(FileDocumentViewControls);
