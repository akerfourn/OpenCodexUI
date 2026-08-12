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

import type { ProjectGitStore } from "../../stores/ProjectGitStore";

type ProjectGitActionsMenuProps = {
  anchorEl: HTMLElement | null;
  gitStore: ProjectGitStore;
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
  gitStore,
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
    void gitStore.publishBranch();
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
        disabled={!gitStore.isAvailable || !gitStore.status.isRepository || gitStore.isLoading}
        onClick={handleSelectBranchAction}
      >
        <ListItemIcon>
          <AccountTreeOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t("git.branchSwitcher")}</ListItemText>
      </MenuItem>
      <MenuItem
        disabled={!gitStore.isAvailable || !gitStore.status.isRepository || gitStore.isLoading}
        onClick={handleSelectMergeAction}
      >
        <ListItemIcon>
          <CallMergeOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t("git.mergeBranch")}</ListItemText>
      </MenuItem>
      <MenuItem
        disabled={!gitStore.isAvailable || !gitStore.status.isRepository || gitStore.isLoading}
        onClick={handleSelectRemoteAction}
      >
        <ListItemIcon>
          <CloudOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText>{t("git.remoteConfigure")}</ListItemText>
      </MenuItem>
      {gitStore.status.branchName !== null && gitStore.status.upstreamName === null ? (
        <MenuItem disabled={!gitStore.canPublishBranch} onClick={handleSelectPublishAction}>
          <ListItemIcon>
            {gitStore.isPushing ? (
              <CircularProgress color="inherit" size={18} />
            ) : (
              <PublishOutlinedIcon fontSize="small" />
            )}
          </ListItemIcon>
          <ListItemText>{t("git.publishBranchTooltip")}</ListItemText>
        </MenuItem>
      ) : null}
      <MenuItem
        disabled={!gitStore.isAvailable || !gitStore.status.isRepository}
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
