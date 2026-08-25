/**
 * Renders the Git actions menu for one opened project.
 */
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import CallMergeOutlinedIcon from "@mui/icons-material/CallMergeOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import {
  CircularProgress,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { ProjectGitReferencesStore } from "../../stores/project/git/ProjectGitReferencesStore";
import type { ProjectGitStatusStore } from "../../stores/project/git/ProjectGitStatusStore";

type ProjectGitActionsMenuProps = {
  anchorEl: HTMLElement | null;
  referencesStore: ProjectGitReferencesStore;
  statusStore: ProjectGitStatusStore;
  isAvailable: boolean;
  onClose(): void;
  onOpenBranch(): void;
  onOpenMerge(): void;
  onOpenRemote(): void;
  onOpenLog(): void;
};

/**
 * Renders the available Git branch, remote, and log actions.
 *
 * @param props Component props.
 *
 * @returns Rendered Git actions menu.
 */
export function ProjectGitActionsMenu({
  anchorEl,
  referencesStore,
  statusStore,
  isAvailable,
  onClose,
  onOpenBranch,
  onOpenMerge,
  onOpenRemote,
  onOpenLog
}: ProjectGitActionsMenuProps) {
  const { t } = useTranslation();

  function handleSelectBranchAction(): void {
    onClose();
    onOpenBranch();
  }

  function handleSelectMergeAction(): void {
    onClose();
    onOpenMerge();
  }

  function handleSelectPublishAction(): void {
    onClose();
    void referencesStore.publishBranch();
  }

  function handleSelectLogAction(): void {
    onClose();
    onOpenLog();
  }

  function handleSelectRemoteAction(): void {
    onClose();
    onOpenRemote();
  }

  return (
    <Menu
      anchorEl={anchorEl}
      open={anchorEl !== null}
      onClose={onClose}
      anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      transformOrigin={{ horizontal: "right", vertical: "top" }}
    >
      <MenuItem
        disabled={!isAvailable || !statusStore.isRepository || statusStore.isLoading}
        onClick={handleSelectBranchAction}
      >
        <ListItemIcon>
          <AccountTreeOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t("git.branchSwitcher")}</ListItemText>
      </MenuItem>
      <MenuItem
        disabled={!isAvailable || !statusStore.isRepository || statusStore.isLoading}
        onClick={handleSelectMergeAction}
      >
        <ListItemIcon>
          <CallMergeOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t("git.mergeBranch")}</ListItemText>
      </MenuItem>
      <MenuItem
        disabled={!isAvailable || !statusStore.isRepository || statusStore.isLoading}
        onClick={handleSelectRemoteAction}
      >
        <ListItemIcon>
          <CloudOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t("git.remoteConfigure")}</ListItemText>
      </MenuItem>
      {statusStore.status.branchName !== null && statusStore.status.upstreamName === null ? (
        <MenuItem disabled={!referencesStore.canPublishBranch} onClick={handleSelectPublishAction}>
          <ListItemIcon>
            {referencesStore.isPushing ? (
              <CircularProgress color="inherit" size={18} />
            ) : (
              <PublishOutlinedIcon fontSize="small" />
            )}
          </ListItemIcon>
          <ListItemText>{t("git.publishBranchTooltip")}</ListItemText>
        </MenuItem>
      ) : null}
      <MenuItem
        disabled={!isAvailable || !statusStore.isRepository}
        onClick={handleSelectLogAction}
      >
        <ListItemIcon>
          <HistoryOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t("git.log")}</ListItemText>
      </MenuItem>
    </Menu>
  );
}

export const ProjectGitActionsMenuX = observer(ProjectGitActionsMenu);
