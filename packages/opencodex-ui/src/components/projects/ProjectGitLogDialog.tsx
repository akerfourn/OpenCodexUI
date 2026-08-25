/**
 * Renders a paginated Git log dialog.
 */
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { UIEvent } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectGitLogStore } from "../../stores/project/git/ProjectGitLogStore";
import { ProjectGitLogCommitItemX } from "./ProjectGitLogCommitItem";

type ProjectGitLogDialogProps = {
  logStore: ProjectGitLogStore;
  open: boolean;
  onClose(): void;
};

/**
 * Renders the project Git history modal.
 *
 * @param props Component props.
 *
 * @returns Rendered Git log dialog.
 */
export function ProjectGitLogDialog({ logStore, open, onClose }: ProjectGitLogDialogProps) {
  const { t } = useTranslation();
  const canLoadMore = logStore.hasMoreLogCommits && !logStore.isLoadingLog;
  const isInitialLoading = logStore.isLoadingLog && logStore.logCommits.length === 0;
  const emptyContent = logStore.hasLoadedLog && logStore.logCommits.length === 0 && logStore.logErrorMessage === null
    ? (
        <Typography variant="body2" color="text.secondary">
          {t("git.logEmpty")}
        </Typography>
      )
    : null;
  const loadMoreContent = logStore.hasMoreLogCommits
    ? (
        <Button
          size="small"
          variant="outlined"
          disabled={!canLoadMore}
          onClick={handleLoadMore}
        >
          {logStore.isLoadingLog ? t("git.logLoading") : t("git.logLoadMore")}
        </Button>
      )
    : null;

  useEffect(() => {
    if (open && !logStore.hasLoadedLog) {
      void logStore.loadGitLog(true);
    }
  }, [logStore, open]);

  function handleRefresh(): void {
    void logStore.loadGitLog(true);
  }

  function handleLoadMore(): void {
    void logStore.loadMoreGitLog();
  }

  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    const element = event.currentTarget;
    const remainingDistance = element.scrollHeight - element.scrollTop - element.clientHeight;

    if (remainingDistance < 160 && canLoadMore) {
      void logStore.loadMoreGitLog();
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <HistoryOutlinedIcon fontSize="small" />
          <span>{t("git.logTitle")}</span>
        </Stack>
      </DialogTitle>
      <DialogContent dividers onScroll={handleScroll} sx={{ minHeight: 420 }}>
        <Stack spacing={1}>
          {logStore.logErrorMessage !== null ? (
            <Alert severity="error">{logStore.logErrorMessage}</Alert>
          ) : null}
          {isInitialLoading ? (
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <CircularProgress size={18} />
              <Typography variant="body2" color="text.secondary">
                {t("git.logLoading")}
              </Typography>
            </Stack>
          ) : null}
          {emptyContent}
          {logStore.logCommits.map((commit) => (
            <ProjectGitLogCommitItemX
              key={commit.hash}
              commit={commit}
              logStore={logStore}
            />
          ))}
          {loadMoreContent !== null ? (
            <Box sx={{ display: "flex", justifyContent: "center", pt: 1 }}>
              {loadMoreContent}
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleRefresh} disabled={logStore.isLoadingLog}>
          {t("git.logRefresh")}
        </Button>
        <Button onClick={onClose}>{t("git.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

export const ProjectGitLogDialogX = observer(ProjectGitLogDialog);
