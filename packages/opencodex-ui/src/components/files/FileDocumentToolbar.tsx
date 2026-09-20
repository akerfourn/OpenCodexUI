import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { Box, Button, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import SaveOutlined from "@mui/icons-material/SaveOutlined";
import Refresh from "@mui/icons-material/Refresh";
import OpenInNew from "@mui/icons-material/OpenInNew";
import { useTranslation } from "react-i18next";
import type { FileDocument } from "../../stores/files/FileDocument";
import type { ProjectFilesStore } from "../../stores/files/ProjectFilesStore";
import type { RootStore } from "../../stores/RootStore";

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
  const readOnly = document.isReadOnly ? (
    <Typography variant="caption" color="text.secondary">
      {t("files.readOnly")}
    </Typography>
  ) : null;
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", px: 1, py: 0.5, flexShrink: 0 }}>
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
      {external}
      {reloadButton}
      <Button
        size="small"
        startIcon={icon}
        onClick={save}
        disabled={!document.isDirty || document.isReadOnly || busy}
      >
        {t("files.save")}
      </Button>
    </Stack>
  );
}
export const FileDocumentToolbarX = observer(FileDocumentToolbar);
