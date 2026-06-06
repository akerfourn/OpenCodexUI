/**
 * Renders external read-only context folders for one project.
 */
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import {
  Alert,
  Box,
  CircularProgress,
  IconButton,
  Stack,
  Switch,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectStore } from "../../stores/ProjectStore";

type ProjectContextPanelProps = {
  projectStore: ProjectStore;
};

/**
 * Renders the project context folder management panel.
 *
 * @param props Component props.
 * @returns Rendered context panel.
 */
export function ProjectContextPanel({ projectStore }: ProjectContextPanelProps) {
  const { t } = useTranslation();
  const contextStore = projectStore.contextStore;
  const isBusy = contextStore.isSaving || contextStore.isPickingFolder || contextStore.isSyncing;

  function handlePickFolder(): void {
    void contextStore.pickAndAddFolder();
  }

  function handleSync(): void {
    void contextStore.syncConfig();
  }

  return (
    <section className="project-context-panel">
      <Stack spacing={1.25}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: "1 1 auto" }}>
            {t("contextFolders.description")}
          </Typography>
          <Tooltip title={t("contextFolders.add")}>
            <span>
              <IconButton
                size="small"
                disabled={!contextStore.isAvailable || isBusy}
                aria-label={t("contextFolders.add")}
                onClick={handlePickFolder}
              >
                {contextStore.isPickingFolder ? (
                  <CircularProgress size={16} />
                ) : (
                  <CreateNewFolderOutlinedIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        {!contextStore.isAvailable ? (
          <Alert severity="warning">{t("contextFolders.sourceUnavailable")}</Alert>
        ) : null}

        {projectStore.trustRequest !== null ? (
          <Alert severity="info">{t("contextFolders.trustRequired")}</Alert>
        ) : null}

        <Stack spacing={0.75}>
          {contextStore.folders.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {t("contextFolders.empty")}
            </Typography>
          ) : null}

          {contextStore.folders.map((folder) => (
            <Box key={folder.id} className="project-context-folder-row">
              <Switch
                size="small"
                checked={folder.enabled}
                disabled={!contextStore.isAvailable || isBusy}
                aria-label={t("contextFolders.toggle")}
                onChange={(_event, checked) => {
                  void contextStore.setFolderEnabled(folder.id, checked);
                }}
              />
              <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
                <Typography variant="body2" noWrap>
                  {folder.label ?? folder.path}
                </Typography>
                <Typography variant="caption" color="text.secondary" noWrap>
                  {folder.path}
                </Typography>
              </Box>
              <Tooltip title={t("contextFolders.remove")}>
                <span>
                  <IconButton
                    size="small"
                    disabled={!contextStore.isAvailable || isBusy}
                    aria-label={t("contextFolders.remove")}
                    onClick={() => {
                      void contextStore.removeFolder(folder.id);
                    }}
                  >
                    <DeleteOutlineOutlinedIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ))}
        </Stack>

        <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography variant="caption" color="text.secondary">
            {contextStore.lastSyncedAt === null
              ? t("contextFolders.notSynced")
              : t("contextFolders.lastSynced", { date: new Date(contextStore.lastSyncedAt).toLocaleString() })}
          </Typography>
          <Tooltip title={t("contextFolders.sync")}>
            <span>
              <IconButton
                size="small"
                disabled={!contextStore.canSync}
                aria-label={t("contextFolders.sync")}
                onClick={handleSync}
              >
                {contextStore.isSyncing ? (
                  <CircularProgress size={16} />
                ) : (
                  <SyncOutlinedIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>
    </section>
  );
}

export const ProjectContextPanelX = observer(ProjectContextPanel);
