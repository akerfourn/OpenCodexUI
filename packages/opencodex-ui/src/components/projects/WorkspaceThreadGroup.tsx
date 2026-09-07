import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import { Box, IconButton, Menu, MenuItem, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { workspaceLabel, type WorkspaceThreadGroup as ThreadGroup } from "../../stores/project/threads/workspaceThreadGroups";
import { ThreadButtonX } from "../threads/ThreadButton";
import type { OpenSubAgentDialog } from "../threads/subAgentDialog";
import { WorkspacePropertiesDialogX } from "./WorkspacePropertiesDialog";

/** A named, collapsible workspace owns its chat list and local creation action. */
export function WorkspaceThreadGroup({ group, project, root, onOpenSubAgentDialog }: {
  group: ThreadGroup; project: ProjectStore; root: RootStore; onOpenSubAgentDialog: OpenSubAgentDialog;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const workspace = group.workspace;
  const name = workspace === null ? t("workspaces.unavailable") : workspaceLabel(workspace, t("workspaces.primary"));
  const newConversationLabel = t("workspaces.newConversationIn", { name });
  const disabled = workspace === null || workspace.removedAt !== null || project.isReadOnlyFromCache
    || project.workspaces.isBusy || project.threadListStore.isCreatingThread;
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
  /** Opens workspace actions independently of the selected conversation. */
  function handleMenu(event: MouseEvent<HTMLButtonElement>): void {
    setAnchor(event.currentTarget);
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
      {threads}{empty}{properties}
      <Menu open={anchor !== null} anchorEl={anchor} onClose={() => setAnchor(null)}>
        <MenuItem onClick={handleProperties}>{t("workspaces.properties")}</MenuItem>
      </Menu>
    </Box>
  );
}
export const WorkspaceThreadGroupX = observer(WorkspaceThreadGroup);
