/**
 * Renders changed, deferred, and staged Git files for one opened project.
 */
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectGitChangesStore } from "../../stores/project/git/ProjectGitChangesStore";
import { GitSectionHeader } from "./GitSectionHeader";
import { ProjectGitFileRow } from "./ProjectGitFileRow";

type ProjectGitFileSectionsProps = {
  canOpenFiles: boolean;
  gitLabelsKey: "git.simple" | "git.technical";
  changesStore: ProjectGitChangesStore;
  onOpenFile(path: string): void;
};

/**
 * Renders the changed, deferred, and staged Git file sections.
 *
 * @param props Component props.
 *
 * @returns Rendered Git file sections.
 */
export function ProjectGitFileSections({
  canOpenFiles,
  gitLabelsKey,
  changesStore,
  onOpenFile
}: ProjectGitFileSectionsProps) {
  const { t } = useTranslation();

  return (
    <>
      <Stack spacing={1}>
        <GitSectionHeader
          title={t(`${gitLabelsKey}.changed`)}
          count={changesStore.changedFilesCount}
          primaryActionLabel={t(`${gitLabelsKey}.stageSelected`)}
          secondaryActionLabel={t(`${gitLabelsKey}.stageAll`)}
          tertiaryActionDisabled={changesStore.selectedChangedPaths.length === 0 || changesStore.isBusy}
          tertiaryActionLabel={t("git.deferSelected")}
          primaryActionDisabled={changesStore.selectedChangedPaths.length === 0 || changesStore.isBusy}
          secondaryActionDisabled={changesStore.changedFilesCount === 0 || changesStore.isBusy}
          onPrimaryAction={changesStore.stageSelected}
          onSecondaryAction={changesStore.stageAll}
          onTertiaryAction={changesStore.deferSelected}
        />
        {changesStore.stageableChangedFiles.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t(`${gitLabelsKey}.noChangedFiles`)}
          </Typography>
        ) : (
          <Stack className="git-file-list" spacing={0.25}>
            {changesStore.stageableChangedFiles.map((file) => (
              <ProjectGitFileRow
                key={`changed:${file.path}`}
                actionIcon={<KeyboardArrowDownOutlinedIcon fontSize="small" />}
                actionLabel={t(`${gitLabelsKey}.stageFile`)}
                canOpenFile={canOpenFiles}
                checked={changesStore.selectedChangedPaths.includes(file.path)}
                deferDirectoryLabel={t("git.deferDirectory")}
                deferFileLabel={t("git.deferFile")}
                disabled={changesStore.isBusy}
                file={file}
                onDeferDirectory={changesStore.deferPath}
                onDeferFile={changesStore.deferPath}
                onAction={changesStore.stagePath}
                onOpenFile={onOpenFile}
                onToggle={changesStore.toggleChangedPath}
              />
            ))}
          </Stack>
        )}
      </Stack>

      {changesStore.deferredChangedFiles.length > 0 ? (
        <Stack className="git-deferred-section" spacing={1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
              <Typography variant="subtitle2">
                {t("git.deferred", { count: changesStore.deferredFilesCount })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("git.deferredDescription")}
              </Typography>
            </Box>
            <Button
              size="small"
              disabled={changesStore.isBusy}
              onClick={changesStore.restoreAllDeferred}
            >
              {t("git.restoreAllDeferred")}
            </Button>
          </Stack>
          <Stack className="git-file-list" spacing={0.25}>
            {changesStore.deferredChangedFiles.map((file) => (
              <ProjectGitFileRow
                key={`deferred:${file.path}`}
                actionIcon={<UnarchiveOutlinedIcon fontSize="small" />}
                actionLabel={t("git.restoreDeferred")}
                actionPath={changesStore.getDeferredPathFor(file.path) ?? file.path}
                canOpenFile={canOpenFiles}
                checked={false}
                disabled={changesStore.isBusy}
                file={file}
                onAction={changesStore.restoreDeferredPath}
                onOpenFile={onOpenFile}
              />
            ))}
          </Stack>
        </Stack>
      ) : null}

      <Divider />

      <Stack spacing={1}>
        <GitSectionHeader
          title={t(`${gitLabelsKey}.staged`)}
          count={changesStore.stagedFilesCount}
          primaryActionLabel={t(`${gitLabelsKey}.unstageSelected`)}
          secondaryActionLabel={t(`${gitLabelsKey}.unstageAll`)}
          primaryActionDisabled={changesStore.selectedStagedPaths.length === 0 || changesStore.isBusy}
          secondaryActionDisabled={changesStore.stagedFilesCount === 0 || changesStore.isBusy}
          onPrimaryAction={changesStore.unstageSelected}
          onSecondaryAction={changesStore.unstageAll}
        />
        {changesStore.stagedFiles.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t(`${gitLabelsKey}.noStagedFiles`)}
          </Typography>
        ) : (
          <Stack className="git-file-list" spacing={0.25}>
            {changesStore.stagedFiles.map((file) => (
              <ProjectGitFileRow
                key={`staged:${file.path}`}
                actionIcon={<KeyboardArrowUpOutlinedIcon fontSize="small" />}
                actionLabel={t(`${gitLabelsKey}.unstageFile`)}
                canOpenFile={canOpenFiles}
                checked={changesStore.selectedStagedPaths.includes(file.path)}
                disabled={changesStore.isBusy}
                file={file}
                onAction={changesStore.unstagePath}
                onOpenFile={onOpenFile}
                onToggle={changesStore.toggleStagedPath}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </>
  );
}

export const ProjectGitFileSectionsX = observer(ProjectGitFileSections);
