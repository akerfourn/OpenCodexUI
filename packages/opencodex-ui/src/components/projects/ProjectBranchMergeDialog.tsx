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

import type { ProjectGitStore } from "../../stores/ProjectGitStore";
import { ProjectBranchGroupX } from "./ProjectBranchGroup";

type ProjectBranchMergeDialogProps = {
  gitStore: ProjectGitStore;
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
  gitStore,
  open,
  onClose
}: ProjectBranchMergeDialogProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();
  const mergeableBranches = useMemo(
    () => filterMergeableBranches(gitStore.branches, normalizedSearchTerm),
    [gitStore.branches, normalizedSearchTerm]
  );

  useEffect(() => {
    if (open) {
      setSearchTerm("");
      void gitStore.loadBranches();
    }
  }, [gitStore, open]);

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearchTerm(event.target.value);
  }

  async function handleMergeBranch(branch: OpenCodexGitBranch): Promise<void> {
    const didMerge = await gitStore.mergeBranch(branch);

    if (didMerge) {
      onClose();
    }
  }

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t("git.mergeBranchTitle")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t("git.mergeBranchSearch")}
            value={searchTerm}
            disabled={gitStore.isMergingBranch}
            onChange={handleSearchChange}
          />

          {gitStore.branchErrorMessage !== null ? (
            <Alert severity="error">{gitStore.branchErrorMessage}</Alert>
          ) : null}

          {gitStore.isLoadingBranches ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <ProjectBranchGroupX
              title={t("git.localBranches")}
              branches={mergeableBranches}
              isBusy={gitStore.isMergingBranch}
              onSelect={handleMergeBranch}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("git.close")}</Button>
      </DialogActions>
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
