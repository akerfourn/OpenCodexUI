import { FileLanguageSelectX } from "./FileLanguageSelect";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography
} from "@mui/material";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import Refresh from "@mui/icons-material/Refresh";
import OpenInNew from "@mui/icons-material/OpenInNew";
import { useTranslation } from "react-i18next";
import type { MouseEvent } from "react";
import type { FileDocument } from "../../stores/files/FileDocument";
import type { ProjectFilesStore } from "../../stores/files/ProjectFilesStore";
import type { RootStore } from "../../stores/RootStore";
import type { FileDiffLayout, FileViewMode } from "../../stores/files/fileOpenIntent";

/** Source context and explicit disk actions for the selected document. */
export function FileDocumentToolbar({
  document,
  files,
  root
}: {
  document: FileDocument;
  files: ProjectFilesStore;
  root: RootStore;
}) {
  const { t } = useTranslation();
  const target = document.target;
  const title = `${document.workspaceName} · ${target?.path ?? document.name}`;
  const busy = document.isLoading || document.isSaving;
  /** Saves only this document on its captured source. */
  function save(): void {
    void document.save();
  }
  /** Routes disk reload through unsaved-change protection. */
  function reload(): void {
    files.reload(document);
  }
  /** Applies a toolbar view choice to this document only. */
  function changeView(_event: MouseEvent<HTMLElement>, value: FileViewMode | null): void {
    if (value !== null) document.setViewMode(value);
  }
  /** Applies a Monaco diff layout choice to this document only. */
  function changeDiffLayout(_event: MouseEvent<HTMLElement>, value: FileDiffLayout | null): void {
    if (value !== null) document.setDiffLayout(value);
  }
  /** Uses only an explicitly supported local opener. */
  async function openExternal(): Promise<void> {
    if (target === null) return;
    try {
      await root.request({
        type: "system.openLink",
        href: target.path,
        projectPath: target.workspacePath,
        sourceId: target.sourceId,
        workspaceId: target.workspaceId
      });
    } catch (error) {
      runInAction(() => {
        document.error = { code: "unavailable", details: String(error) };
      });
    }
  }
  const external =
    target !== null && root.sourcesStore.hasLocalAccess(target.sourceId) ? (
      <Tooltip title={t("files.external")}>
        <IconButton
          size="small"
          aria-label={t("files.external")}
          onClick={() => {
            void openExternal();
          }}
        >
          <OpenInNew fontSize="small" />
        </IconButton>
      </Tooltip>
    ) : null;
  const reloadButton =
    target !== null ? (
      <Tooltip title={t("files.reload")}>
        <span>
          <IconButton size="small" aria-label={t("files.reload")} disabled={busy} onClick={reload}>
            <Refresh fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    ) : null;
  const icon = document.isSaving ? <CircularProgress size={16} /> : <SaveOutlined />;
  const gitDiffReadOnly = document.viewMode === "diff" && document.isGitDiffReadOnly;
  const readOnly = document.isReadOnly || gitDiffReadOnly ? (
    <Typography variant="caption" color="text.secondary">
      {gitDiffReadOnly ? t("files.gitDiffReadOnly") : t("files.readOnly")}
    </Typography>
  ) : null;
  const viewControls = document.gitDiffContext === null ? null : (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={document.viewMode}
      aria-label={t("files.viewMode")}
      onChange={changeView}
    >
      <ToggleButton value="file">{t("files.viewFile")}</ToggleButton>
      <ToggleButton value="diff">{t("files.viewDiff")}</ToggleButton>
    </ToggleButtonGroup>
  );
  const layoutControls = document.viewMode === "diff" && document.gitDiffContext !== null ? (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={document.diffLayout}
      aria-label={t("files.diffLayout")}
      onChange={changeDiffLayout}
    >
      <ToggleButton value="side-by-side">{t("files.diffSideBySide")}</ToggleButton>
      <ToggleButton value="inline">{t("files.diffInline")}</ToggleButton>
    </ToggleButtonGroup>
  ) : null;
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", px: 1, py: 0.5, flexShrink: 0 }}>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Tooltip
          title={`${target?.sourceId ?? ""} · ${target?.workspacePath ?? ""}/${target?.path ?? document.name}`}
        >
          <Typography noWrap variant="caption" component="div">
            {title}
          </Typography>
        </Tooltip>
        {readOnly}
      </Box>
      {viewControls}
      {layoutControls}
      <FileLanguageSelectX document={document} store={root.fileLanguagesStore} />
      {external}
      {reloadButton}
      <Button
        size="small"
        startIcon={icon}
        onClick={save}
        disabled={!document.isDirty || document.isReadOnly || gitDiffReadOnly || busy}
      >
        {t("files.save")}
      </Button>
    </Stack>
  );
}
export const FileDocumentToolbarX = observer(FileDocumentToolbar);
