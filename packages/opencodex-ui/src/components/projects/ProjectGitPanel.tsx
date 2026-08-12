/**
 * Renders Git controls for one opened project.
 */
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
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
import type { ProjectStore } from "../../stores/ProjectStore";
import { CommitMessageGenerationDialogX } from "./CommitMessageGenerationDialog";
import { ProjectBranchMergeDialogX } from "./ProjectBranchMergeDialog";
import { ProjectBranchSwitcherDialogX } from "./ProjectBranchSwitcherDialog";
import { ProjectGitReferenceTagRowX } from "./ProjectGitReferenceTagRow";
import { ProjectGitLogDialogX } from "./ProjectGitLogDialog";
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
  const [gitActionsAnchor, setGitActionsAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    void gitStore.refresh();
  }, [gitStore, projectPath, sourceId]);

  function handleRefresh(): void {
    void gitStore.refresh();
  }

  function handleOpenGitActions(event: MouseEvent<HTMLButtonElement>): void {
    setGitActionsAnchor(event.currentTarget);
  }

  function handleCloseGitActions(): void {
    setGitActionsAnchor(null);
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
    void gitStore.push();
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
        <Tooltip title={t("git.actions")}>
          <span className="git-panel-header-action">
            <IconButton
              aria-label={t("git.actions")}
              size="small"
              disabled={!gitStore.isAvailable || !gitStore.status.isRepository}
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
              disabled={!gitStore.isAvailable || gitStore.isLoading}
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
        gitStore={gitStore}
        onClose={handleCloseGitActions}
        onOpenBranch={handleOpenBranchDialog}
        onOpenMerge={handleOpenMergeDialog}
        onOpenRemote={handleOpenRemoteDialog}
        onOpenLog={handleOpenLogDialog}
      />

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

            <ProjectGitFileSectionsX
              canOpenFiles={canOpenFiles}
              gitLabelsKey={gitLabelsKey}
              gitStore={gitStore}
              onOpenFile={handleOpenFile}
            />

            {gitStore.stagedFilesCount > 0 ? (
              <>
                <Divider />
                <ProjectGitCommitSectionX
                  generateTooltip={generateTooltip}
                  gitLabelsKey={gitLabelsKey}
                  gitStore={gitStore}
                  onOpenGenerateDialog={handleOpenGenerateDialog}
                />
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
      <ProjectGitRemoteDialogX
        gitStore={gitStore}
        open={isRemoteDialogOpen}
        onClose={handleCloseRemoteDialog}
      />
      <ProjectGitLogDialogX
        gitStore={gitStore}
        open={isLogDialogOpen}
        onClose={handleCloseLogDialog}
      />
    </section>
  );
}

export const ProjectGitPanelX = observer(ProjectGitPanel);
