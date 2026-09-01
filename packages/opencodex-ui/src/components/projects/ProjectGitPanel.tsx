/**
 * Renders Git controls for one opened project.
 */
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
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
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { MouseEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { CommitMessageGenerationDialogX } from "./CommitMessageGenerationDialog";
import { ProjectBranchMergeDialogX } from "./ProjectBranchMergeDialog";
import { ProjectBranchSwitcherDialogX } from "./ProjectBranchSwitcherDialog";
import { ProjectGitReferenceTagRowX } from "./ProjectGitReferenceTagRow";
import { ProjectGitLogDialogX } from "./ProjectGitLogDialog";
import { ProjectGitProtectedBranchesDialogX } from "./ProjectGitProtectedBranchesDialog";
import { ProjectGitRemoteDialogX } from "./ProjectGitRemoteDialog";
import { ProjectTagSelectorDialogX } from "./ProjectTagSelectorDialog";
import { ProjectGitActionsMenuX } from "./ProjectGitActionsMenu";
import { ProjectGitCommitSectionX } from "./ProjectGitCommitSection";
import { ProjectGitFileSectionsX } from "./ProjectGitFileSections";

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
  const changesStore = gitStore.changesStore;
  const commitStore = gitStore.commitStore;
  const referencesStore = gitStore.referencesStore;
  const tagStore = gitStore.tagStore;
  const projectPath = projectStore.projectPath;
  const sourceId = projectStore.project.sourceId;
  const source = store.sourcesStore.sources.find((entry) => entry.id === sourceId);
  const canOpenFiles = source !== undefined &&
    store.sourcesStore.hasLocalAccess(source.id) &&
    "openFileCommand" in source.settings &&
    source.settings.openFileCommand !== null;
  const gitLabelsKey = store.appStore.settingsStore.settings.versioningVocabulary === "technical"
    ? "git.technical"
    : "git.simple";
  const [isGenerateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [isBranchDialogOpen, setBranchDialogOpen] = useState(false);
  const [isMergeDialogOpen, setMergeDialogOpen] = useState(false);
  const [isTagDialogOpen, setTagDialogOpen] = useState(false);
  const [isLogDialogOpen, setLogDialogOpen] = useState(false);
  const [isRemoteDialogOpen, setRemoteDialogOpen] = useState(false);
  const [isProtectionDialogOpen, setProtectionDialogOpen] = useState(false);
  const [gitActionsAnchor, setGitActionsAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    void gitStore.statusStore.refresh();
  }, [gitStore, projectPath, sourceId]);

  function handleRefresh(): void {
    void gitStore.statusStore.refresh();
  }

  function handleOpenGitActions(event: MouseEvent<HTMLButtonElement>): void {
    setGitActionsAnchor(event.currentTarget);
  }

  function handleCloseGitActions(): void {
    setGitActionsAnchor(null);
  }

  function handleInitializeRepository(): void {
    void gitStore.statusStore.initializeRepository();
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

  function handleOpenProtectionDialog(): void {
    setProtectionDialogOpen(true);
  }

  function handleCloseProtectionDialog(): void {
    setProtectionDialogOpen(false);
  }

  function handleOpenTagDialog(): void {
    setTagDialogOpen(true);
  }

  function handleCloseTagDialog(): void {
    setTagDialogOpen(false);
  }

  function handleOpenLogDialog(): void {
    setLogDialogOpen(true);
  }

  function handleCloseLogDialog(): void {
    setLogDialogOpen(false);
  }

  function handleOpenRemoteDialog(): void {
    setRemoteDialogOpen(true);
  }

  function handleCloseRemoteDialog(): void {
    setRemoteDialogOpen(false);
  }

  function handleOpenGenerateDialog(): void {
    setGenerateDialogOpen(true);
  }

  function handleCloseGenerateDialog(): void {
    setGenerateDialogOpen(false);
  }

  function handlePush(): void {
    void referencesStore.push();
  }

  function handlePull(): void {
    void referencesStore.pull();
  }

  function handleOpenFile(path: string): void {
    store.openExternalLink(path);
  }

  const generateTooltip = commitStore.canGenerateCommitMessage
    ? t(`${gitLabelsKey}.generateMessage`)
    : t(`${gitLabelsKey}.generateMessageUnavailable`);
  const currentBranchName = gitStore.currentBranchName;
  const isCurrentBranchProtected = gitStore.isCurrentBranchCommitProtected;
  const branchLabel = currentBranchName === null ? t("git.noBranch") : currentBranchName;
  const branchContent = isCurrentBranchProtected ? (
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
      <LockOutlinedIcon color="warning" sx={{ fontSize: 14 }} />
      <Typography variant="caption" color="warning.main" noWrap>
        {branchLabel}
      </Typography>
    </Stack>
  ) : (
    <Typography variant="caption" color="text.secondary" noWrap>
      {branchLabel}
    </Typography>
  );
  const commitTooltip = isCurrentBranchProtected && currentBranchName !== null
    ? t("git.commitProtectedBranchTooltip", { branch: currentBranchName })
    : undefined;

  return (
    <section className="git-panel">
      <Stack
        className="git-panel-header"
        direction="row"
        spacing={0.25}
        sx={{ alignItems: "flex-start" }}
      >
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          {branchContent}
          {gitStore.statusStore.isRepository ? (
            <ProjectGitReferenceTagRowX
              dense
              tagStore={tagStore}
              onOpenSelector={handleOpenTagDialog}
            />
          ) : null}
        </Box>
        <Tooltip title={t("git.actions")}>
          <span className="git-panel-header-action">
            <IconButton
              aria-label={t("git.actions")}
              size="small"
              disabled={!gitStore.isAvailable || !gitStore.statusStore.isRepository}
              onClick={handleOpenGitActions}
              sx={{ height: 26, width: 26 }}
            >
              <MoreVertOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title={t("git.refresh")}>
          <span className="git-panel-header-action">
            <IconButton
              aria-label={t("git.refresh")}
              size="small"
              disabled={!gitStore.isAvailable || gitStore.statusStore.isLoading}
              onClick={handleRefresh}
              sx={{ height: 26, width: 26 }}
            >
              <RefreshOutlinedIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <ProjectGitActionsMenuX
        anchorEl={gitActionsAnchor}
        referencesStore={referencesStore}
        statusStore={gitStore.statusStore}
        isAvailable={gitStore.isAvailable}
        onClose={handleCloseGitActions}
        onOpenBranch={handleOpenBranchDialog}
        onOpenProtection={handleOpenProtectionDialog}
        onOpenMerge={handleOpenMergeDialog}
        onOpenRemote={handleOpenRemoteDialog}
        onOpenLog={handleOpenLogDialog}
      />

      {gitStore.statusStore.isLoading ? <LinearProgress /> : null}

      <Stack className="git-panel-content" spacing={1.5}>
        {!gitStore.isAvailable ? (
          <Alert severity="warning">{t("git.sourceUnavailable")}</Alert>
        ) : null}

        {gitStore.isAvailable && gitStore.statusStore.hasLoaded && !gitStore.statusStore.isRepository ? (
          <Alert
            severity="info"
            action={
              <Button
                color="inherit"
                size="small"
                disabled={gitStore.statusStore.isInitializingRepository}
                startIcon={
                  gitStore.statusStore.isInitializingRepository
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

        {gitStore.statusStore.isRepository ? (
          <>
            {isCurrentBranchProtected && currentBranchName !== null ? (
              <Alert severity="warning" icon={<LockOutlinedIcon fontSize="inherit" />}>
                {t("git.commitProtectedBranch", { branch: currentBranchName })}
              </Alert>
            ) : null}
            {gitStore.statusStore.status.upstreamName !== null ? (
              <Stack direction="row" spacing={1}>
                {gitStore.statusStore.status.behindCount > 0 ? (
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={!referencesStore.canPull}
                    startIcon={
                      referencesStore.isPulling
                        ? <CircularProgress color="inherit" size={14} />
                        : undefined
                    }
                    onClick={handlePull}
                  >
                    {t("git.pullChanges", { count: gitStore.statusStore.status.behindCount })}
                  </Button>
                ) : null}
                {gitStore.statusStore.status.aheadCount > 0 ? (
                  <Button
                    variant="outlined"
                    size="small"
                    disabled={!referencesStore.canPush}
                    startIcon={
                      referencesStore.isPushing
                        ? <CircularProgress color="inherit" size={14} />
                        : undefined
                    }
                    onClick={handlePush}
                  >
                    {t("git.pushChanges", { count: gitStore.statusStore.status.aheadCount })}
                  </Button>
                ) : null}
              </Stack>
            ) : null}

            {tagStore.tagErrorMessage !== null ? (
              <Alert severity="error">{tagStore.tagErrorMessage}</Alert>
            ) : null}

            <ProjectGitFileSectionsX
              canOpenFiles={canOpenFiles}
              gitLabelsKey={gitLabelsKey}
              changesStore={changesStore}
              onOpenFile={handleOpenFile}
            />

            {changesStore.stagedFilesCount > 0 ? (
              <>
                <Divider />
                <ProjectGitCommitSectionX
                  generateTooltip={generateTooltip}
                  commitTooltip={commitTooltip}
                  gitLabelsKey={gitLabelsKey}
                  commitStore={commitStore}
                  onOpenGenerateDialog={handleOpenGenerateDialog}
                />
              </>
            ) : null}
          </>
        ) : null}
      </Stack>
      <CommitMessageGenerationDialogX
        appStore={store.appStore}
        commitStore={commitStore}
        modelOptions={store.appStore.commitMessageModelOptions}
        open={isGenerateDialogOpen}
        onClose={handleCloseGenerateDialog}
      />
      <ProjectBranchSwitcherDialogX
        referencesStore={referencesStore}
        open={isBranchDialogOpen}
        onClose={handleCloseBranchDialog}
      />
      <ProjectBranchMergeDialogX
        referencesStore={referencesStore}
        open={isMergeDialogOpen}
        onClose={handleCloseMergeDialog}
      />
      <ProjectTagSelectorDialogX
        tagStore={tagStore}
        open={isTagDialogOpen}
        onClose={handleCloseTagDialog}
      />
      <ProjectGitRemoteDialogX
        referencesStore={referencesStore}
        open={isRemoteDialogOpen}
        onClose={handleCloseRemoteDialog}
      />
      <ProjectGitLogDialogX
        logStore={gitStore.logStore}
        open={isLogDialogOpen}
        onClose={handleCloseLogDialog}
      />
      <ProjectGitProtectedBranchesDialogX
        gitStore={gitStore}
        referencesStore={referencesStore}
        open={isProtectionDialogOpen}
        onClose={handleCloseProtectionDialog}
      />
    </section>
  );
}

export const ProjectGitPanelX = observer(ProjectGitPanel);
