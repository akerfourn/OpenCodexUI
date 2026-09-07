import { useState, type MouseEvent } from "react";
import { observer } from "mobx-react-lite";
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  IconButton, ListItemIcon, Menu, MenuItem } from "@mui/material";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EventNoteOutlinedIcon from "@mui/icons-material/EventNoteOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import UnarchiveOutlinedIcon from "@mui/icons-material/UnarchiveOutlined";
import { useTranslation } from "react-i18next";
import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import type { RootStore } from "../../stores/RootStore";
import { WorkspaceSwitchDialogX } from "../projects/WorkspaceSwitchDialog";
import { ChatEventLogDialogX } from "../dialogs/ChatEventLogDialog";
import type { OpenSubAgentDialog } from "./subAgentDialog";

/** Conversation properties and lifecycle actions operate on the row's explicit thread. */
export function ThreadActionsMenu({ project, root, thread, title, onOpenSubAgentDialog }: {
  project: ProjectStore; root: RootStore; thread: OpenCodexThread; title: string;
  onOpenSubAgentDialog: OpenSubAgentDialog;
}) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const list = project.threadListStore;
  const archiving = list.archivingThreadId === thread.id;
  const archiveIcon = list.isShowingArchivedThreads ? <UnarchiveOutlinedIcon fontSize="small" /> : <ArchiveOutlinedIcon fontSize="small" />;
  const archiveLabel = list.isShowingArchivedThreads ? t("sidebar.unarchiveThread") : t("sidebar.archiveThread");
  const workspaceAction = list.isShowingArchivedThreads ? null : (
    <MenuItem disabled={project.isReadOnlyFromCache || project.workspaces.isBusy} onClick={handleWorkspace}>
      <ListItemIcon><AccountTreeOutlinedIcon fontSize="small" /></ListItemIcon>{t("workspaces.switch")}
    </MenuItem>
  );
  const workspaceDialog = workspaceOpen
    ? <WorkspaceSwitchDialogX project={project} thread={thread} onClose={() => setWorkspaceOpen(false)} /> : null;

  /** Prevents menu and portal clicks from selecting the underlying conversation. */
  function stopPropagation(event: MouseEvent): void { event.stopPropagation(); }
  /** Opens row actions without opening the conversation. */
  function handleMenu(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    setAnchor(event.currentTarget);
  }
  /** Closes the menu before displaying the workspace property dialog. */
  function handleWorkspace(): void {
    setAnchor(null);
    setWorkspaceOpen(true);
  }
  /** Uses the current catalogue mode to archive or restore this row. */
  function handleArchive(): void {
    setAnchor(null);
    if (list.isShowingArchivedThreads) list.unarchiveThread(thread.id);
    else list.archiveThread(thread.id);
  }
  /** Opens the existing child-conversation browser. */
  function handleSubAgents(): void {
    setAnchor(null);
    onOpenSubAgentDialog(thread);
  }
  /** Opens source-scoped event history for this row. */
  function handleLog(): void {
    setAnchor(null);
    setLogOpen(true);
  }
  /** Requests confirmation for the existing destructive action. */
  function handleDeleteDialog(): void {
    setAnchor(null);
    setDeleteOpen(true);
  }
  /** Deletes the explicitly confirmed conversation. */
  function handleDelete(): void {
    setDeleteOpen(false);
    list.deleteThread(thread.id);
  }
  return (
    <span onClick={stopPropagation}>
      <IconButton aria-label={t("sidebar.threadActions")} size="small" disabled={archiving}
        onClick={handleMenu} sx={{ mt: -0.5 }}><MoreVertOutlinedIcon fontSize="small" /></IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}>
        {workspaceAction}
        <MenuItem onClick={handleArchive}><ListItemIcon>{archiveIcon}</ListItemIcon>{archiveLabel}</MenuItem>
        <MenuItem onClick={handleSubAgents}>
          <ListItemIcon><AccountTreeOutlinedIcon fontSize="small" /></ListItemIcon>{t("sidebar.subAgentThreads")}
        </MenuItem>
        <MenuItem onClick={handleLog}>
          <ListItemIcon><EventNoteOutlinedIcon fontSize="small" /></ListItemIcon>{t("sidebar.threadEventLog")}
        </MenuItem>
        <MenuItem onClick={handleDeleteDialog}>
          <ListItemIcon><DeleteOutlineOutlinedIcon color="error" fontSize="small" /></ListItemIcon>{t("sidebar.deleteThread")}
        </MenuItem>
      </Menu>
      {workspaceDialog}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)}>
        <DialogTitle>{t("sidebar.deleteThreadTitle")}</DialogTitle>
        <DialogContent><DialogContentText>{t("sidebar.deleteThreadDescription", { thread: title })}</DialogContentText></DialogContent>
        <DialogActions>
          <Button disabled={archiving} onClick={() => setDeleteOpen(false)}>{t("sidebar.deleteThreadCancel")}</Button>
          <Button color="error" disabled={archiving} variant="contained" onClick={handleDelete}>{t("sidebar.deleteThreadConfirm")}</Button>
        </DialogActions>
      </Dialog>
      <ChatEventLogDialogX open={logOpen} sourceId={project.resolveThreadSourceId(thread)} threadId={thread.id}
        threadTitle={title} store={root} onClose={() => setLogOpen(false)} />
    </span>
  );
}
export const ThreadActionsMenuX = observer(ThreadActionsMenu);
