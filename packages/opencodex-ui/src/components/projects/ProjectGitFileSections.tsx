/**
 * Renders changed, deferred, and staged Git files for one opened project.
 */
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import { Box, Button, Divider, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectGitStore } from "../../stores/ProjectGitStore";
import { GitSectionHeader } from "./GitSectionHeader";
import { ProjectGitFileRow } from "./ProjectGitFileRow";

type ProjectGitFileSectionsProps = {
  canOpenFiles: boolean;
  gitLabelsKey: "git.simple" | "git.technical";
  gitStore: ProjectGitStore;
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
  gitStore,
  onOpenFile
}: ProjectGitFileSectionsProps) {
  const { t } = useTranslation();

  return (
    <>
      <Stack spacing={1}>
        <GitSectionHeader
          title={t(`${gitLabelsKey}.changed`)}
          count={gitStore.changedFilesCount}
          primaryActionLabel={t(`${gitLabelsKey}.stageSelected`)}
          secondaryActionLabel={t(`${gitLabelsKey}.stageAll`)}
          tertiaryActionDisabled={gitStore.selectedChangedPaths.length === 0 || gitStore.isBusy}
          tertiaryActionLabel={t("git.deferSelected")}
          primaryActionDisabled={gitStore.selectedChangedPaths.length === 0 || gitStore.isBusy}
          secondaryActionDisabled={gitStore.changedFilesCount === 0 || gitStore.isBusy}
          onPrimaryAction={gitStore.stageSelected}
          onSecondaryAction={gitStore.stageAll}
          onTertiaryAction={gitStore.deferSelected}
        />
        {gitStore.stageableChangedFiles.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t(`${gitLabelsKey}.noChangedFiles`)}
          </Typography>
        ) : (
          <Stack className="git-file-list" spacing={0.25}>
            {gitStore.stageableChangedFiles.map((file) => (
              <ProjectGitFileRow
                key={`changed:${file.path}`}
                actionIcon={<KeyboardArrowDownOutlinedIcon fontSize="small" />}
                actionLabel={t(`${gitLabelsKey}.stageFile`)}
                canOpenFile={canOpenFiles}
                checked={gitStore.selectedChangedPaths.includes(file.path)}
                deferDirectoryLabel={t("git.deferDirectory")}
                deferFileLabel={t("git.deferFile")}
                disabled={gitStore.isBusy}
                file={file}
                onDeferDirectory={gitStore.deferPath}
                onDeferFile={gitStore.deferPath}
                onAction={gitStore.stagePath}
                onOpenFile={onOpenFile}
                onToggle={gitStore.toggleChangedPath}
              />
            ))}
          </Stack>
        )}
      </Stack>

      {gitStore.deferredChangedFiles.length > 0 ? (
        <Stack className="git-deferred-section" spacing={1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
              <Typography variant="subtitle2">
                {t("git.deferred", { count: gitStore.deferredFilesCount })}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t("git.deferredDescription")}
              </Typography>
            </Box>
            <Button
              size="small"
              disabled={gitStore.isBusy}
              onClick={gitStore.restoreAllDeferred}
            >
              {t("git.restoreAllDeferred")}
            </Button>
          </Stack>
          <Stack className="git-file-list" spacing={0.25}>
            {gitStore.deferredChangedFiles.map((file) => (
              <ProjectGitFileRow
                key={`deferred:${file.path}`}
                actionIcon={<UnarchiveOutlinedIcon fontSize="small" />}
                actionLabel={t("git.restoreDeferred")}
                actionPath={gitStore.getDeferredPathFor(file.path) ?? file.path}
                canOpenFile={canOpenFiles}
                checked={false}
                disabled={gitStore.isBusy}
                file={file}
                onAction={gitStore.restoreDeferredPath}
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
          count={gitStore.stagedFilesCount}
          primaryActionLabel={t(`${gitLabelsKey}.unstageSelected`)}
          secondaryActionLabel={t(`${gitLabelsKey}.unstageAll`)}
          primaryActionDisabled={gitStore.selectedStagedPaths.length === 0 || gitStore.isBusy}
          secondaryActionDisabled={gitStore.stagedFilesCount === 0 || gitStore.isBusy}
          onPrimaryAction={gitStore.unstageSelected}
          onSecondaryAction={gitStore.unstageAll}
        />
        {gitStore.status.stagedFiles.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t(`${gitLabelsKey}.noStagedFiles`)}
          </Typography>
        ) : (
          <Stack className="git-file-list" spacing={0.25}>
            {gitStore.status.stagedFiles.map((file) => (
              <ProjectGitFileRow
                key={`staged:${file.path}`}
                actionIcon={<KeyboardArrowUpOutlinedIcon fontSize="small" />}
                actionLabel={t(`${gitLabelsKey}.unstageFile`)}
                canOpenFile={canOpenFiles}
                checked={gitStore.selectedStagedPaths.includes(file.path)}
                disabled={gitStore.isBusy}
                file={file}
                onAction={gitStore.unstagePath}
                onOpenFile={onOpenFile}
                onToggle={gitStore.toggleStagedPath}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </>
  );
}

export const ProjectGitFileSectionsX = observer(ProjectGitFileSections);
