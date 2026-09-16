/**
 * Renders external context folders and the project-wide access scope.
 */
import CreateNewFolderOutlinedIcon from "@mui/icons-material/CreateNewFolderOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import {
  Alert,
  CircularProgress,
  FormControl,
  FormHelperText,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import type { SelectChangeEvent } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectContextAccessScope } from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ProjectContextFolderAddDialogX } from "./ProjectContextFolderAddDialog";
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
  const [isAddDialogOpen, setAddDialogOpen] = useState(false);
  const isBusy = contextStore.isSaving || contextStore.isPickingFolder || contextStore.isSyncing;
  const accessScope = contextStore.accessScope;
  const accessScopeDescription = getAccessScopeDescriptionKey(accessScope);

  function handleOpenAddDialog(): void {
    setAddDialogOpen(true);
  }

  function handleCloseAddDialog(): void {
    setAddDialogOpen(false);
  }

  function handleSync(): void {
    void contextStore.syncConfig();
  }

  function handleAccessScopeChange(event: SelectChangeEvent): void {
    const nextAccessScope = event.target.value;

    if (!isAccessScope(nextAccessScope)) {
      return;
    }

    void contextStore.setAccessScope(nextAccessScope);
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
                onClick={handleOpenAddDialog}
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
        <FormControl fullWidth size="small" disabled={!contextStore.isAvailable || isBusy}>
          <InputLabel id="context-access-scope-label">
            {t("contextFolders.accessScope")}
          </InputLabel>
          <Select
            labelId="context-access-scope-label"
            label={t("contextFolders.accessScope")}
            value={accessScope}
            onChange={handleAccessScopeChange}
          >
            <MenuItem value="inherit">{t("contextFolders.accessScopeInherit")}</MenuItem>
            <MenuItem value="local">{t("contextFolders.accessScopeLocal")}</MenuItem>
            <MenuItem value="global">{t("contextFolders.accessScopeGlobal")}</MenuItem>
          </Select>
          <FormHelperText>{t(accessScopeDescription)}</FormHelperText>
        </FormControl>
        <ProjectContextFolderAddDialogX
          contextStore={contextStore}
          open={isAddDialogOpen}
          onClose={handleCloseAddDialog}
        />

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

/** Checks whether a select value is a supported project-wide access scope. */
function isAccessScope(value: string): value is OpenCodexProjectContextAccessScope {
  return value === "inherit" || value === "local" || value === "global";
}

/** Maps the selected scope to its localized explanatory text. */
function getAccessScopeDescriptionKey(
  accessScope: OpenCodexProjectContextAccessScope
): "contextFolders.accessScopeInheritDescription"
  | "contextFolders.accessScopeLocalDescription"
  | "contextFolders.accessScopeGlobalDescription" {
  if (accessScope === "local") {
    return "contextFolders.accessScopeLocalDescription";
  }

  if (accessScope === "global") {
    return "contextFolders.accessScopeGlobalDescription";
  }

  return "contextFolders.accessScopeInheritDescription";
}
