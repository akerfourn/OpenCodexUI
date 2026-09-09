/**
 * Renders local branch selection for Git merge.
 */
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
  TextField
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexGitBranch } from "@open-codex-ui/opencodex-protocol";

import type { ProjectGitChangesStore } from "../../stores/project/git/ProjectGitChangesStore";
import type { ProjectGitReferencesStore } from "../../stores/project/git/ProjectGitReferencesStore";
import { ProjectBranchGroupX } from "./ProjectBranchGroup";

type ProjectBranchMergeDialogProps = {
  direction: "from" | "to";
  changesStore: ProjectGitChangesStore;
  referencesStore: ProjectGitReferencesStore;
  open: boolean;
  onClose(): void;
};

/**
 * Renders the branch merge dialog.
 *
 * @param props Component props.
 * @returns Rendered dialog.
 */
export function ProjectBranchMergeDialog({
  direction,
  changesStore,
  referencesStore,
  open,
  onClose
}: ProjectBranchMergeDialogProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedBranchFullName, setSelectedBranchFullName] = useState<string | null>(null);
  const [isDirtyMergeConfirmationOpen, setIsDirtyMergeConfirmationOpen] = useState(false);
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const mergeableBranches = useMemo(
    () => filterMergeableBranches(referencesStore.branches, normalizedSearchTerm),
    [referencesStore.branches, normalizedSearchTerm]
  );
  const selectedBranch = useMemo(
    () => mergeableBranches.find((branch) => branch.fullName === selectedBranchFullName) ?? null,
    [mergeableBranches, selectedBranchFullName]
  );

  useEffect(() => {
    if (open) {
      setSearchTerm("");
      setSelectedBranchFullName(null);
      setIsDirtyMergeConfirmationOpen(false);
      void referencesStore.loadBranches();
    }
  }, [referencesStore, direction, open]);

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearchTerm(event.target.value);
    setSelectedBranchFullName(null);
  }

  function handleSelectBranch(branch: OpenCodexGitBranch): void {
    setSelectedBranchFullName(branch.fullName);
  }

  function handleRequestMerge(): void {
    if (selectedBranch === null) {
      return;
    }

    if (direction === "to" && changesStore.hasUncommittedChanges) {
      setIsDirtyMergeConfirmationOpen(true);
      return;
    }

    void mergeBranch(selectedBranch, false);
  }

  function handleConfirmDirtyMerge(): void {
    if (selectedBranch === null) {
      setIsDirtyMergeConfirmationOpen(false);
      return;
    }

    setIsDirtyMergeConfirmationOpen(false);
    void mergeBranch(selectedBranch, true);
  }

  async function mergeBranch(
    branch: OpenCodexGitBranch,
    allowDirtyWorktree: boolean
  ): Promise<void> {
    const didMerge = direction === "from"
      ? await referencesStore.mergeBranch(branch)
      : await referencesStore.mergeBranchTo(branch, allowDirtyWorktree);

    if (didMerge) {
      handleClose();
    }
  }

  function handleClose(): void {
    setIsDirtyMergeConfirmationOpen(false);
    onClose();
  }

  const mergeTitle = direction === "from"
    ? t("git.mergeFromBranchTitle")
    : t("git.mergeToBranchTitle");
  const mergeDescription = direction === "from"
    ? t("git.mergeFromBranchDescription")
    : t("git.mergeToBranchDescription");
  const mergeDescriptionSeverity: "info" | "warning" = direction === "from"
    ? "info"
    : "warning";

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={handleClose}>
      <DialogTitle>{mergeTitle}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity={mergeDescriptionSeverity}>{mergeDescription}</Alert>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t("git.mergeBranchSearch")}
            value={searchTerm}
            disabled={referencesStore.isMergingBranch}
            onChange={handleSearchChange}
          />

          {referencesStore.branchErrorMessage !== null ? (
            <Alert severity="error">{referencesStore.branchErrorMessage}</Alert>
          ) : null}

          {referencesStore.isLoadingBranches ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <ProjectBranchGroupX
              title={t("git.localBranches")}
              branches={mergeableBranches}
              isBusy={referencesStore.isMergingBranch}
              selectedBranchFullName={selectedBranchFullName}
              onSelect={handleSelectBranch}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t("git.close")}</Button>
        <Button
          variant="contained"
          disabled={selectedBranch === null || referencesStore.isMergingBranch}
          startIcon={referencesStore.isMergingBranch ? <CircularProgress size={16} /> : undefined}
          onClick={handleRequestMerge}
        >
          {t("git.merge")}
        </Button>
      </DialogActions>

      <Dialog
        open={isDirtyMergeConfirmationOpen}
        fullWidth
        maxWidth="xs"
        onClose={() => setIsDirtyMergeConfirmationOpen(false)}
      >
        <DialogTitle>{t("git.mergeToDirtyTitle")}</DialogTitle>
        <DialogContent>
          <Alert severity="warning">{t("git.mergeToDirtyDescription")}</Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsDirtyMergeConfirmationOpen(false)}>
            {t("git.close")}
          </Button>
          <Button
            variant="contained"
            color="warning"
            disabled={referencesStore.isMergingBranch}
            onClick={handleConfirmDirtyMerge}
          >
            {t("git.mergeToDirtyConfirm")}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}

export const ProjectBranchMergeDialogX = observer(ProjectBranchMergeDialog);

function filterMergeableBranches(
  branches: OpenCodexGitBranch[],
  searchTerm: string
): OpenCodexGitBranch[] {
  return branches.filter((branch) => {
    const isMergeable = branch.kind === "local" && !branch.isCurrent;

    if (!isMergeable) {
      return false;
    }

    if (searchTerm.length === 0) {
      return true;
    }

    return branch.name.toLowerCase().includes(searchTerm) ||
      branch.fullName.toLowerCase().includes(searchTerm);
  });
}
