import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import { Button } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { ProjectGitStore } from "../../stores/project/git/ProjectGitStore";
import { ProjectGitSyncDialogX } from "./ProjectGitSyncDialog";

interface ProjectGitSyncActionProps {
  gitStore: ProjectGitStore;
  onOpenFile(path: string): void;
}

/** Keeps synchronization available even while a paused rebase has detached HEAD. */
export function ProjectGitSyncAction({ gitStore, onOpenFile }: ProjectGitSyncActionProps) {
  const { t } = useTranslation();
  /** Opens a fresh comparison before authorizing an outgoing push. */
  function handleOpen(): void { void gitStore.sync.open(); }
  /** Opens the selected conflict in the existing file editor, leaving Git paused. */
  function handleOpenFile(path: string): void {
    gitStore.sync.close();
    onOpenFile(path);
  }
  return (
    <>
      <Button variant="outlined" size="small" startIcon={<SyncOutlinedIcon />} disabled={!gitStore.sync.canOpen}
        onClick={handleOpen}>{t("gitSync.open")}</Button>
      <ProjectGitSyncDialogX sync={gitStore.sync} onOpenFile={handleOpenFile} />
    </>
  );
}

export const ProjectGitSyncActionX = observer(ProjectGitSyncAction);
