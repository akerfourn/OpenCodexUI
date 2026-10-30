import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import TaskAltOutlinedIcon from "@mui/icons-material/TaskAltOutlined";
import { Box, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { OpenCodexWorkspaceLockState } from "@open-codex-ui/opencodex-protocol";
import { WorkspaceLockDialogX } from "./WorkspaceLockDialog";
import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { workspaceLabel, type WorkspaceThreadGroup as ThreadGroup } from "../../stores/project/threads/workspaceThreadGroups";
import { ThreadButtonX } from "../threads/ThreadButton";
import type { OpenSubAgentDialog } from "../threads/subAgentDialog";
import { WorkspacePropertiesDialogX } from "./WorkspacePropertiesDialog";
import { WorkspaceMoveDialogX } from "./WorkspaceMoveDialog";
import { PrimaryWorkspaceMoveDialogX } from "./PrimaryWorkspaceMoveDialog";
import { WorkspaceRelocateDialogX } from "./WorkspaceRelocateDialog";
import { WorkspaceRemoveDialogX } from "./WorkspaceRemoveDialog";
import { WorkspacePreparationDialogX } from "./WorkspacePreparationDialog";

/** A named, collapsible workspace owns its chat list and local creation action. */
export function WorkspaceThreadGroup({ group, project, root, onOpenSubAgentDialog }: {
  group: ThreadGroup; project: ProjectStore; root: RootStore; onOpenSubAgentDialog: OpenSubAgentDialog;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [relocating, setRelocating] = useState(false);
  const [moving, setMoving] = useState(false);
  const [lockSnapshot, setLockSnapshot] = useState<OpenCodexWorkspaceLockState | null>(null);
  const [removing, setRemoving] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const workspace = group.workspace;
  let name = workspace === null ? t("workspaces.unavailable") : workspaceLabel(workspace, t("workspaces.primary"));
  if (workspace?.removedAt != null) name = t("workspaces.removedName", { name });
  const newConversationLabel = t("workspaces.newConversationIn", { name });
  const disabled = workspace === null || workspace.removedAt !== null || project.isReadOnlyFromCache
    || workspace.removalPending === true || workspace.movePending === true || project.workspaces.isBusy || project.threadListStore.isCreatingThread;
  const lockState = workspace === null ? undefined : project.workspaces.lockStates.get(workspace.id);
  const checkingLock = workspace !== null && project.workspaces.loadingLockIds.has(workspace.id);
  const lockUnknown = checkingLock || lockState === undefined;
  const locked = lockState !== undefined && lockState.lockedReason !== null;
  const lockBadge = locked ? <Tooltip title={lockState.lockedReason || t("workspaces.lockWithoutReason")}>
    <LockOutlinedIcon fontSize="small" color="action" aria-label={t("workspaces.locked")} />
  </Tooltip> : null;
  const lockDialog = lockSnapshot === null ? null
    : <WorkspaceLockDialogX project={project} state={lockSnapshot} onClose={() => setLockSnapshot(null)} />;
  const lockLabel = locked ? t("workspaces.unlock") : t("workspaces.lock");
  const completed = workspace !== null && !workspace.isPrimary && workspace.workStatus === "completed";
  const workStatusBadge = completed ? <Tooltip title={t("workspaceWorkStatus.completed")}>
    <TaskAltOutlinedIcon fontSize="small" color="success" aria-label={t("workspaceWorkStatus.completed")} />
  </Tooltip> : null;
  const workStatusAction = completed ? "workspaceWorkStatus.reopen" : "workspaceWorkStatus.complete";
  const statusDisabled = workspace === null || workspace.removedAt !== null || workspace.movePending === true
    || workspace.removalPending === true || project.workspaces.isBusy;
  /** Changes the fixed workspace's manual progress without acting on its conversations or files. */
  function handleWorkStatus(): void {
    setAnchor(null);
    if (workspace !== null && !workspace.isPrimary) void project.workspaces.setWorkStatus(workspace, completed ? "active" : "completed");
  }
  const workStatusItem = workspace !== null && !workspace.isPrimary
    ? <MenuItem disabled={statusDisabled} onClick={handleWorkStatus}>{t(workStatusAction)}</MenuItem> : null;
  let lockAction = null;
  if (workspace !== null && !workspace.isPrimary && workspace.removedAt === null) {
    let label = t("workspaces.lockUnavailable");
    if (checkingLock) label = t("workspaces.lockLoading");
    else if (lockState?.supported === true) label = lockLabel;
    lockAction = <MenuItem disabled={disabled || checkingLock || lockState?.supported !== true} onClick={handleLock}>
      {label}</MenuItem>;
  }
  const expandIcon = collapsed ? <ChevronRightOutlinedIcon /> : <ExpandMoreOutlinedIcon />;
  const threads = collapsed ? null : group.threads.map((thread) => (
    <ThreadButtonX key={thread.id} projectStore={project} root={root} thread={thread}
      onOpenSubAgentDialog={onOpenSubAgentDialog} />
  ));
  const empty = !collapsed && group.threads.length === 0
    ? <Typography sx={{ px: 2, pb: 1 }} variant="caption" color="text.secondary">{t("workspaces.empty")}</Typography>
    : null;
  const properties = propertiesOpen && workspace !== null
    ? <WorkspacePropertiesDialogX project={project} workspace={workspace} onClose={() => setPropertiesOpen(false)} />
    : null;
  const preparation = preparing && workspace !== null
    ? <WorkspacePreparationDialogX project={project} workspace={workspace}
      sourceName={root.sourcesStore.findSource(workspace.sourceId)?.name} onClose={() => setPreparing(false)} /> : null;
  /** Opens explicit preparation independently of the selected chat or workspace. */
  function handlePrepare(): void { setAnchor(null); setPreparing(true); }
  const removal = removing && workspace !== null
    ? <WorkspaceRemoveDialogX project={project} workspace={workspace} onClose={() => setRemoving(false)} /> : null;
  const relocation = relocating && workspace !== null
    ? <WorkspaceRelocateDialogX project={project} workspace={workspace} onClose={() => setRelocating(false)} /> : null;
  const canRelocate = workspace !== null && workspace.removedAt === null;
  const relocateAction = canRelocate ? <MenuItem disabled={disabled} onClick={handleRelocate}>
    {t("workspaces.relocate")}</MenuItem> : null;
  /** Opens directory reassociation for the chosen workspace, including the primary. */
  function handleRelocate(): void {
    setAnchor(null);
    setRelocating(true);
  }
  const canRemove = workspace !== null && !workspace.isPrimary && workspace.managed && workspace.removedAt === null;
  const removeAction = canRemove ? <MenuItem disabled={disabled || lockUnknown || locked} onClick={handleRemove} sx={{ color: "error.main" }}>
    {t("workspaces.remove")}</MenuItem> : null;
  let movement = null;
  let moveAction = null;
  if (workspace !== null && workspace.isPrimary) {
    if (moving) movement = <PrimaryWorkspaceMoveDialogX project={project} workspace={workspace} onClose={() => setMoving(false)} />;
    moveAction = <MenuItem disabled={disabled} onClick={handleMove}>{t("primaryWorkspaceMove.title")}</MenuItem>;
  } else if (workspace !== null && workspace.removedAt === null) {
    if (moving) movement = <WorkspaceMoveDialogX project={project} workspace={workspace} onClose={() => setMoving(false)} />;
    moveAction = <MenuItem disabled={disabled || lockUnknown || locked} onClick={handleMove}>{t("workspaces.move")}</MenuItem>;
  }
  /** Opens configured storage choices for this fixed workspace identity. */
  function handleMove(): void {
    setAnchor(null);
    setMoving(true);
  }
  /** Shows the irreversible operation independently of properties or the selected chat. */
  function handleRemove(): void {
    setAnchor(null);
    setRemoving(true);
  }
  /** Freezes the state being reviewed, so a later external change cannot silently alter confirmation. */
  function handleLock(): void {
    if (lockState === undefined || checkingLock || !lockState.supported) return;
    setAnchor(null);
    setLockSnapshot({ ...lockState });
  }
  /** Opens workspace actions independently of the selected conversation. */
  function handleMenu(event: MouseEvent<HTMLButtonElement>): void {
    setAnchor(event.currentTarget);
    if (workspace !== null && !workspace.isPrimary && !disabled) void project.workspaces.loadLockState(workspace.id);
  }
  /** Creates directly inside this workspace without migrating any conversation. */
  function handleCreate(): void {
    if (workspace !== null) project.threadListStore.createThread(workspace.id);
    setCollapsed(false);
  }
  /** Opens metadata for this fixed workspace identity. */
  function handleProperties(): void {
    setAnchor(null);
    setPropertiesOpen(true);
  }
  return (
    <Box component="section" aria-label={name} sx={{ mb: 1 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
        <IconButton size="small" aria-label={name} aria-expanded={!collapsed} onClick={() => setCollapsed(!collapsed)}>
          {expandIcon}
        </IconButton>
        <Typography variant="subtitle2" noWrap sx={{ flex: 1 }} title={name}>{name}</Typography>
        {workStatusBadge}{lockBadge}
        <Typography variant="caption" color="text.secondary">{group.threads.length}</Typography>
        <Tooltip title={newConversationLabel}>
          <span style={{ display: "inline-flex" }}>
            <IconButton size="small" aria-label={newConversationLabel} disabled={disabled} onClick={handleCreate}>
              <AddCommentOutlinedIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <IconButton size="small" aria-label={t("workspaces.actions", { name })}
          disabled={workspace === null} onClick={handleMenu}><MoreVertOutlinedIcon fontSize="small" /></IconButton>
      </Box>
      {threads}{empty}{properties}{removal}{relocation}{movement}{lockDialog}{preparation}
      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={handleProperties}>{t("workspaces.properties")}</MenuItem>
        {workStatusItem}
        <MenuItem disabled={disabled} onClick={handlePrepare}>{t("workspacePreparation.title")}</MenuItem>
        {lockAction}{moveAction}{relocateAction}{removeAction}
      </Menu>
    </Box>
  );
}
export const WorkspaceThreadGroupX = observer(WorkspaceThreadGroup);
