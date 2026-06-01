/**
 * Renders Git controls for one opened project.
 */
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import CallMergeOutlinedIcon from "@mui/icons-material/CallMergeOutlined";
import KeyboardArrowDownOutlinedIcon from "@mui/icons-material/KeyboardArrowDownOutlined";
import KeyboardArrowUpOutlinedIcon from "@mui/icons-material/KeyboardArrowUpOutlined";
import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  LinearProgress,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { CommitMessageGenerationDialogX } from "./CommitMessageGenerationDialog";
import { ProjectBranchMergeDialogX } from "./ProjectBranchMergeDialog";
import { ProjectBranchSwitcherDialogX } from "./ProjectBranchSwitcherDialog";
import { ProjectGitReferenceTagRowX } from "./ProjectGitReferenceTagRow";
import { ProjectTagSelectorDialogX } from "./ProjectTagSelectorDialog";
import { ProjectGitFileRow } from "./ProjectGitFileRow";
import { GitSectionHeader } from "./GitSectionHeader";

type ProjectGitPanelProps = {
  store: RootStore;
  projectStore: ProjectStore;
};

/**
 * Renders the project Git panel.
 *
 * @param props Component props.
 *
 * @returns Rendered Git panel.
 */
export function ProjectGitPanel({ store, projectStore }: ProjectGitPanelProps) {
  const { t } = useTranslation();
  const gitStore = projectStore.gitStore;
  const projectPath = projectStore.projectPath;
  const sourceId = projectStore.project.sourceId;
  const source = store.sourcesStore.sources.find((entry) => entry.id === sourceId);
  const canOpenFiles = source?.settings.openFileCommand !== null &&
    source?.settings.openFileCommand !== undefined;
  const gitLabelsKey = store.appStore.settings.versioningVocabulary === "technical"
    ? "git.technical"
    : "git.simple";
  const [isGenerateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [isBranchDialogOpen, setBranchDialogOpen] = useState(false);
  const [isMergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [isTagDialogOpen, setTagDialogOpen] = useState(false);

  useEffect(() => {
    void gitStore.refresh();
  }, [gitStore, projectPath, sourceId]);

  function handleRefresh(): void {
    void gitStore.refresh();
  }

  function handleInitializeRepository(): void {
    void gitStore.initializeRepository();
  }

  function handleOpenBranchDialog(): void {
    setBranchDialogOpen(true);
  }

  function handleCloseBranchDialog(): void {
    setBranchDialogOpen(false);
  }

  function handleOpenMergeDialog(): void {
    setMergeDialogOpen(true);
  }

  function handleCloseMergeDialog(): void {
    setMergeDialogOpen(false);
  }

  function handleOpenTagDialog(): void {
    setTagDialogOpen(true);
  }

  function handleCloseTagDialog(): void {
    setTagDialogOpen(false);
  }

  function handleStageSelected(): void {
    void gitStore.stageSelected();
  }

  function handleStageAll(): void {
    void gitStore.stageAll();
  }

  function handleUnstageSelected(): void {
    void gitStore.unstageSelected();
  }

  function handleUnstageAll(): void {
    void gitStore.unstageAll();
  }

  function handleCommitMessageChange(event: ChangeEvent<HTMLInputElement>): void {
    gitStore.setCommitMessage(event.target.value);
  }

  function handleCommit(): void {
    void gitStore.commit();
  }

  function handleOpenGenerateDialog(): void {
    setGenerateDialogOpen(true);
  }

  function handleCloseGenerateDialog(): void {
    setGenerateDialogOpen(false);
  }

  function handlePush(): void {
    void gitStore.push();
  }

  function handlePublishBranch(): void {
    void gitStore.publishBranch();
  }

  function handlePull(): void {
    void gitStore.pull();
  }

  function handleOpenFile(path: string): void {
    store.openExternalLink(path);
  }

  const generateTooltip = gitStore.canGenerateCommitMessage
    ? t(`${gitLabelsKey}.generateMessage`)
    : t(`${gitLabelsKey}.generateMessageUnavailable`);

  return (
    <section className="git-panel">
      <Stack
        className="git-panel-header"
        direction="row"
        spacing={0.25}
        sx={{ alignItems: "flex-start" }}
      >
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          {gitStore.status.branchName !== null ? (
            <Typography variant="caption" color="text.secondary" noWrap>
              {gitStore.status.branchName}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary" noWrap>
              {t("git.noBranch")}
            </Typography>
          )}
          {gitStore.status.isRepository ? (
            <ProjectGitReferenceTagRowX
              dense
              gitStore={gitStore}
              onOpenSelector={handleOpenTagDialog}
            />
          ) : null}
        </Box>
        <Tooltip title={t("git.branchSwitcher")}>
          <span className="git-panel-header-action">
            <IconButton
              aria-label={t("git.branchSwitcher")}
              size="small"
              disabled={!gitStore.isAvailable || !gitStore.status.isRepository || gitStore.isLoading}
              onClick={handleOpenBranchDialog}
              sx={{ height: 26, width: 26 }}
            >
              <AccountTreeOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("git.mergeBranch")}>
          <span className="git-panel-header-action">
            <IconButton
              aria-label={t("git.mergeBranch")}
              size="small"
              disabled={!gitStore.isAvailable || !gitStore.status.isRepository || gitStore.isLoading}
              onClick={handleOpenMergeDialog}
              sx={{ height: 26, width: 26 }}
            >
              <CallMergeOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        {gitStore.status.branchName !== null && gitStore.status.upstreamName === null ? (
          <Tooltip title={t("git.publishBranchTooltip")}>
            <span className="git-panel-header-action">
              <IconButton
                aria-label={t("git.publishBranch")}
                size="small"
                disabled={!gitStore.canPublishBranch}
                onClick={handlePublishBranch}
                sx={{ height: 26, width: 26 }}
              >
                {gitStore.isPushing ? (
                  <CircularProgress color="inherit" size={14} />
                ) : (
                  <PublishOutlinedIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </span>
          </Tooltip>
        ) : null}
        <Tooltip title={t("git.refresh")}>
          <span className="git-panel-header-action">
            <IconButton
              aria-label={t("git.refresh")}
              size="small"
              disabled={!gitStore.isAvailable || gitStore.isLoading}
              onClick={handleRefresh}
              sx={{ height: 26, width: 26 }}
            >
              <RefreshOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>

      {gitStore.isLoading ? <LinearProgress /> : null}

      <Stack className="git-panel-content" spacing={1.5}>
        {!gitStore.isAvailable ? (
          <Alert severity="warning">{t("git.sourceUnavailable")}</Alert>
        ) : null}

        {gitStore.isAvailable && gitStore.hasLoaded && !gitStore.status.isRepository ? (
          <Alert
            severity="info"
            action={
              <Button
                color="inherit"
                size="small"
                disabled={gitStore.isInitializingRepository}
                startIcon={
                  gitStore.isInitializingRepository
                    ? <CircularProgress color="inherit" size={14} />
                    : undefined
                }
                onClick={handleInitializeRepository}
              >
                {t("git.initializeRepository")}
              </Button>
            }
          >
            {t("git.noRepository")}
          </Alert>
        ) : null}

        {gitStore.errorMessage !== null ? (
          <Alert severity="error">{gitStore.errorMessage}</Alert>
        ) : null}

        {gitStore.status.isRepository ? (
          <>
            {gitStore.status.upstreamName !== null ? (
              <Stack direction="row" spacing={1}>
                {gitStore.status.behindCount > 0 ? (
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={!gitStore.canPull}
                    startIcon={
                      gitStore.isPulling
                        ? <CircularProgress color="inherit" size={14} />
                        : undefined
                    }
                    onClick={handlePull}
                  >
                    {t("git.pullChanges", { count: gitStore.status.behindCount })}
                  </Button>
                ) : null}
                {gitStore.status.aheadCount > 0 ? (
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={!gitStore.canPush}
                    startIcon={
                      gitStore.isPushing
                        ? <CircularProgress color="inherit" size={14} />
                        : undefined
                    }
                    onClick={handlePush}
                  >
                    {t("git.pushChanges", { count: gitStore.status.aheadCount })}
                  </Button>
                ) : null}
              </Stack>
            ) : null}

            {gitStore.tagErrorMessage !== null ? (
              <Alert severity="error">{gitStore.tagErrorMessage}</Alert>
            ) : null}

            <Stack spacing={1}>
              <GitSectionHeader
                title={t(`${gitLabelsKey}.changed`)}
                count={gitStore.changedFilesCount}
                primaryActionLabel={t(`${gitLabelsKey}.stageSelected`)}
                secondaryActionLabel={t(`${gitLabelsKey}.stageAll`)}
                primaryActionDisabled={gitStore.selectedChangedPaths.length === 0 || gitStore.isLoading}
                secondaryActionDisabled={gitStore.changedFilesCount === 0 || gitStore.isLoading}
                onPrimaryAction={handleStageSelected}
                onSecondaryAction={handleStageAll}
              />
              {gitStore.status.changedFiles.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  {t(`${gitLabelsKey}.noChangedFiles`)}
                </Typography>
              ) : (
                <Stack className="git-file-list" spacing={0.25}>
                  {gitStore.status.changedFiles.map((file) => (
                    <ProjectGitFileRow
                      key={`changed:${file.path}`}
                      actionIcon={<KeyboardArrowDownOutlinedIcon fontSize="small" />}
                      actionLabel={t(`${gitLabelsKey}.stageFile`)}
                      canOpenFile={canOpenFiles}
                      checked={gitStore.selectedChangedPaths.includes(file.path)}
                      file={file}
                      onAction={gitStore.stagePath}
                      onOpenFile={handleOpenFile}
                      onToggle={gitStore.toggleChangedPath}
                    />
                  ))}
                </Stack>
              )}
            </Stack>

            <Divider />

            <Stack spacing={1}>
              <GitSectionHeader
                title={t(`${gitLabelsKey}.staged`)}
                count={gitStore.stagedFilesCount}
                primaryActionLabel={t(`${gitLabelsKey}.unstageSelected`)}
                secondaryActionLabel={t(`${gitLabelsKey}.unstageAll`)}
                primaryActionDisabled={gitStore.selectedStagedPaths.length === 0 || gitStore.isLoading}
                secondaryActionDisabled={gitStore.stagedFilesCount === 0 || gitStore.isLoading}
                onPrimaryAction={handleUnstageSelected}
                onSecondaryAction={handleUnstageAll}
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
                      file={file}
                      onAction={gitStore.unstagePath}
                      onOpenFile={handleOpenFile}
                      onToggle={gitStore.toggleStagedPath}
                    />
                  ))}
                </Stack>
              )}
            </Stack>

            {gitStore.stagedFilesCount > 0 ? (
              <>
                <Divider />

                <Stack spacing={1}>
                  {gitStore.isGeneratingCommitMessage ? <LinearProgress /> : null}
                  <TextField
                    label={t(`${gitLabelsKey}.commitMessage`)}
                    value={gitStore.commitMessage}
                    minRows={3}
                    multiline
                    fullWidth
                    disabled={gitStore.isCommitting || gitStore.isGeneratingCommitMessage}
                    onChange={handleCommitMessageChange}
                  />
                  <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                    <Tooltip title={generateTooltip}>
                      <span>
                        <IconButton
                          aria-label={t(`${gitLabelsKey}.generateMessage`)}
                          size="small"
                          disabled={!gitStore.canGenerateCommitMessage}
                          onClick={handleOpenGenerateDialog}
                        >
                          <AutoAwesomeOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Button
                      variant="contained"
                      disabled={!gitStore.canCommit}
                      onClick={handleCommit}
                    >
                      {t(`${gitLabelsKey}.commit`)}
                    </Button>
                  </Stack>
                </Stack>
              </>
            ) : null}
          </>
        ) : null}
      </Stack>
      <CommitMessageGenerationDialogX
        gitStore={gitStore}
        open={isGenerateDialogOpen}
        onClose={handleCloseGenerateDialog}
      />
      <ProjectBranchSwitcherDialogX
        gitStore={gitStore}
        open={isBranchDialogOpen}
        onClose={handleCloseBranchDialog}
      />
      <ProjectBranchMergeDialogX
        gitStore={gitStore}
        open={isMergeDialogOpen}
        onClose={handleCloseMergeDialog}
      />
      <ProjectTagSelectorDialogX
        gitStore={gitStore}
        open={isTagDialogOpen}
        onClose={handleCloseTagDialog}
      />
    </section>
  );
}

export const ProjectGitPanelX = observer(ProjectGitPanel);
