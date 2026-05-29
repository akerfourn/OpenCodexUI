/**
 * Renders Git branch search, checkout, and creation controls.
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
  Divider,
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

type ProjectBranchSwitcherDialogProps = {
  gitStore: ProjectGitStore;
  open: boolean;
  onClose(): void;
};

/**
 * Renders the branch switcher dialog.
 *
 * @param props Component props.
 *
 * @returns Rendered dialog.
 */
export function ProjectBranchSwitcherDialog({
  gitStore,
  open,
  onClose
}: ProjectBranchSwitcherDialogProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearchTerm = searchTerm.trim();
  const filteredBranches = useMemo(
    () => filterBranches(gitStore.branches, normalizedSearchTerm),
    [gitStore.branches, normalizedSearchTerm]
  );
  const localBranches = filteredBranches.filter((branch) => branch.kind === "local");
  const remoteBranches = filteredBranches.filter((branch) => branch.kind === "remote");
  const canCreateBranch = canCreateBranchFromInput(gitStore.branches, normalizedSearchTerm);

  useEffect(() => {
    if (open) {
      setSearchTerm("");
      void gitStore.loadBranches();
    }
  }, [gitStore, open]);

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearchTerm(event.target.value);
  }

  async function handleCheckoutBranch(branch: OpenCodexGitBranch): Promise<void> {
    const didCheckout = await gitStore.checkoutBranch(branch);

    if (didCheckout) {
      onClose();
    }
  }

  async function handleCreateBranch(): Promise<void> {
    const didCreate = await gitStore.createBranch(normalizedSearchTerm);

    if (didCreate) {
      onClose();
    }
  }

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t("git.branchSwitcherTitle")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t("git.branchSearch")}
            value={searchTerm}
            disabled={gitStore.isCheckingOutBranch}
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
            <Stack spacing={2}>
              {canCreateBranch ? (
                <Button
                  variant="text"
                  size="small"
                  disabled={gitStore.isCheckingOutBranch}
                  onClick={handleCreateBranch}
                  sx={{ alignSelf: "flex-start" }}
                >
                  {t("git.createBranch", { name: normalizedSearchTerm })}
                </Button>
              ) : null}

              <ProjectBranchGroupX
                title={t("git.localBranches")}
                branches={localBranches}
                gitStore={gitStore}
                onCheckout={handleCheckoutBranch}
              />
              <Divider />
              <ProjectBranchGroupX
                title={t("git.remoteBranches")}
                branches={remoteBranches}
                gitStore={gitStore}
                onCheckout={handleCheckoutBranch}
              />
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("git.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

export const ProjectBranchSwitcherDialogX = observer(ProjectBranchSwitcherDialog);

function filterBranches(
  branches: OpenCodexGitBranch[],
  searchTerm: string
): OpenCodexGitBranch[] {
  if (searchTerm.length === 0) {
    return branches;
  }

  const normalizedSearchTerm = searchTerm.toLowerCase();
  return branches.filter((branch) => (
    branch.name.toLowerCase().includes(normalizedSearchTerm) ||
    branch.fullName.toLowerCase().includes(normalizedSearchTerm)
  ));
}

function canCreateBranchFromInput(
  branches: OpenCodexGitBranch[],
  searchTerm: string
): boolean {
  if (searchTerm.length === 0) {
    return false;
  }

  return !branches.some((branch) => branch.name === searchTerm);
}
