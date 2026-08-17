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

import type { ProjectGitReferencesStore } from "../../stores/ProjectGitReferencesStore";
import { ProjectBranchGroupX } from "./ProjectBranchGroup";

type ProjectBranchSwitcherDialogProps = {
  referencesStore: ProjectGitReferencesStore;
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
  referencesStore,
  open,
  onClose
}: ProjectBranchSwitcherDialogProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const normalizedSearchTerm = searchTerm.trim();
  const filteredBranches = useMemo(
    () => filterBranches(referencesStore.branches, normalizedSearchTerm),
    [referencesStore.branches, normalizedSearchTerm]
  );
  const localBranches = filteredBranches.filter((branch) => branch.kind === "local");
  const remoteBranches = filteredBranches.filter((branch) => branch.kind === "remote");
  const canCreateBranch = canCreateBranchFromInput(referencesStore.branches, normalizedSearchTerm);

  useEffect(() => {
    if (open) {
      setSearchTerm("");
      void referencesStore.loadBranches();
    }
  }, [referencesStore, open]);

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearchTerm(event.target.value);
  }

  async function handleCheckoutBranch(branch: OpenCodexGitBranch): Promise<void> {
    const didCheckout = await referencesStore.checkoutBranch(branch);

    if (didCheckout) {
      onClose();
    }
  }

  async function handleCreateBranch(): Promise<void> {
    const didCreate = await referencesStore.createBranch(normalizedSearchTerm);

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
            disabled={referencesStore.isCheckingOutBranch}
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
            <Stack spacing={2}>
              {canCreateBranch ? (
                <Button
                  variant="text"
                  size="small"
                  disabled={referencesStore.isCheckingOutBranch}
                  onClick={handleCreateBranch}
                  sx={{ alignSelf: "flex-start" }}
                >
                  {t("git.createBranch", { name: normalizedSearchTerm })}
                </Button>
              ) : null}

              <ProjectBranchGroupX
                title={t("git.localBranches")}
                branches={localBranches}
                isBusy={referencesStore.isCheckingOutBranch}
                onSelect={handleCheckoutBranch}
              />
              <Divider />
              <ProjectBranchGroupX
                title={t("git.remoteBranches")}
                branches={remoteBranches}
                isBusy={referencesStore.isCheckingOutBranch}
                onSelect={handleCheckoutBranch}
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
