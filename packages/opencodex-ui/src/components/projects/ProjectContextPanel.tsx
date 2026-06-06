/**
 * Renders external read-only context folders for one project.
 */
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import {
  Alert,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectStore } from "../../stores/ProjectStore";
import { ProjectContextFolderRowX } from "./ProjectContextFolderRow";

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
            <ProjectContextFolderRowX
              key={folder.id}
              contextStore={contextStore}
              folder={folder}
              disabled={!contextStore.isAvailable || isBusy}
            />
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
