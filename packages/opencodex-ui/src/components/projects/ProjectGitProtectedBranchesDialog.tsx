/** Renders the project-local Git commit protection editor. */
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent, KeyboardEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectGitReferencesStore } from "../../stores/project/git/ProjectGitReferencesStore";
import type { ProjectGitStore } from "../../stores/project/git/ProjectGitStore";
import { normalizeCommitProtectedBranches } from "../../stores/project/git/gitCommitProtection";

type ProjectGitProtectedBranchesDialogProps = {
  gitStore: ProjectGitStore;
  referencesStore: ProjectGitReferencesStore;
  open: boolean;
  onClose(): void;
};

/**
 * Renders the list of branches protected from commits initiated by OpenCodexUI.
 *
 * @param props Git stores and dialog lifecycle callbacks.
 * @returns Rendered protected-branch dialog.
 */
export function ProjectGitProtectedBranchesDialog({
  gitStore,
  referencesStore,
  open,
  onClose
}: ProjectGitProtectedBranchesDialogProps) {
  const { t } = useTranslation();
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [newBranchName, setNewBranchName] = useState("");
  const localBranches = useMemo(
    () => referencesStore.branches.filter((branch) => branch.kind === "local"),
    [referencesStore.branches]
  );
  const availableBranchNames = useMemo(
    () => normalizeCommitProtectedBranches([
      ...localBranches.map((branch) => branch.name),
      ...(gitStore.currentBranchName === null ? [] : [gitStore.currentBranchName]),
      ...selectedBranches
    ]),
    [gitStore.currentBranchName, localBranches, selectedBranches]
  );
  const selectedBranchesKey = selectedBranches.join("\u0000");
  const savedBranchesKey = gitStore.commitProtectedBranches.join("\u0000");
  const isSaving = gitStore.isUpdatingCommitProtectedBranches;
  const canSave = !isSaving && selectedBranchesKey !== savedBranchesKey;

  useEffect(() => {
    if (!open) {
      return;
    }

    setSelectedBranches([...gitStore.commitProtectedBranches]);
    setNewBranchName("");
    void referencesStore.loadBranches();
  }, [gitStore, open, referencesStore]);

  function handleClose(): void {
    if (!isSaving) {
      onClose();
    }
  }

  function handleToggleBranch(branchName: string): void {
    setSelectedBranches((currentBranches) => {
      if (currentBranches.includes(branchName)) {
        return currentBranches.filter((currentBranch) => currentBranch !== branchName);
      }

      return normalizeCommitProtectedBranches([...currentBranches, branchName]);
    });
  }

  function handleNewBranchNameChange(event: ChangeEvent<HTMLInputElement>): void {
    setNewBranchName(event.target.value);
  }

  function handleNewBranchNameKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAddBranch();
    }
  }

  function handleAddBranch(): void {
    const branchName = newBranchName.trim();

    if (branchName.length === 0 || selectedBranches.includes(branchName)) {
      return;
    }

    setSelectedBranches((currentBranches) => (
      normalizeCommitProtectedBranches([...currentBranches, branchName])
    ));
    setNewBranchName("");
  }

  async function handleSave(): Promise<void> {
    const didSave = await gitStore.updateCommitProtectedBranches(selectedBranches);

    if (didSave) {
      onClose();
    }
  }

  const currentBranchAlert = gitStore.isCurrentBranchCommitProtected &&
    gitStore.currentBranchName !== null ? (
      <Alert severity="warning" icon={<LockOutlinedIcon fontSize="inherit" />}>
        {t("git.commitProtectedBranch", { branch: gitStore.currentBranchName })}
      </Alert>
    ) : null;
  const branchList = availableBranchNames.length > 0 ? (
    <List dense disablePadding>
      {availableBranchNames.map((branchName) => {
        const localBranch = localBranches.find((branch) => branch.name === branchName);
        const secondary = localBranch?.isCurrent
          ? t("git.currentBranch")
          : localBranch === undefined
            ? t("git.protectedBranchNotFound")
            : undefined;

        return (
          <ListItemButton
            key={branchName}
            disabled={isSaving}
            onClick={() => handleToggleBranch(branchName)}
          >
            <Checkbox
              edge="start"
              checked={selectedBranches.includes(branchName)}
              tabIndex={-1}
              disableRipple
            />
            <ListItemText primary={branchName} secondary={secondary} />
          </ListItemButton>
        );
      })}
    </List>
  ) : (
    <Typography variant="body2" color="text.secondary">
      {t("git.noBranches")}
    </Typography>
  );

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={handleClose}>
      <DialogTitle>{t("git.protectedBranchesTitle")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t("git.protectedBranchesDescription")}
          </Typography>
          {currentBranchAlert}
          <Box>
            <Typography variant="overline" color="text.secondary">
              {t("git.localBranches")}
            </Typography>
            {referencesStore.isLoadingBranches ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", py: 1 }}>
                <CircularProgress size={18} />
                <Typography variant="body2" color="text.secondary">
                  {t("git.loadingBranches")}
                </Typography>
              </Stack>
            ) : branchList}
          </Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
            <TextField
              fullWidth
              size="small"
              label={t("git.protectedBranchAdd")}
              placeholder={t("git.protectedBranchPlaceholder")}
              value={newBranchName}
              disabled={isSaving}
              onChange={handleNewBranchNameChange}
              onKeyDown={handleNewBranchNameKeyDown}
            />
            <Button
              variant="outlined"
              size="small"
              disabled={isSaving || newBranchName.trim().length === 0}
              startIcon={<AddOutlinedIcon />}
              onClick={handleAddBranch}
              sx={{ minHeight: 40, whiteSpace: "nowrap" }}
            >
              {t("git.add")}
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t("common.cancel")}</Button>
        <Button variant="contained" disabled={!canSave} onClick={() => void handleSave()}>
          {t("git.protectedBranchesSave")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const ProjectGitProtectedBranchesDialogX = observer(ProjectGitProtectedBranchesDialog);
