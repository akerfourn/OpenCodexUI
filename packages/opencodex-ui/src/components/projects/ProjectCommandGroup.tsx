import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import { Box, ButtonBase, CircularProgress, Collapse, IconButton, ListItemText, Menu, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useId, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type { ProjectCommandsStore, ProjectCommandRunView } from "../../stores/project/ProjectCommandsStore";
import { ProjectCommandListX } from "./ProjectCommandList";

/** A compact group header owns inline renaming, empty-state creation and a non-destructive group menu. */
export function ProjectCommandGroup({ name, commands, store, expanded, onToggle, onCreate, onEdit, onOpenLogs }: {
  name: string; commands: OpenCodexProjectCommand[]; store: ProjectCommandsStore; expanded: boolean;
  onToggle(): void; onCreate(groupName: string): void; onEdit(command: OpenCodexProjectCommand): void;
  onOpenLogs(run: ProjectCommandRunView): void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const saving = store.isSaving || store.groups.isSaving;
  const duplicate = draft.trim() !== name && store.groups.names.includes(draft.trim());
  const invalid = draft.trim().length === 0 || draft.trim().length > 100
    || duplicate;
  const groupHelp = duplicate ? t("commands.groupExists") : undefined;
  const expandIcon = expanded ? <ExpandMoreOutlinedIcon fontSize="small" /> : <ChevronRightOutlinedIcon fontSize="small" />;
  const activity = commands.some(command => store.hasRunningRuns(command.id))
    ? <CircularProgress size={12} aria-label={t("commands.groupRunning")} /> : null;

  /** Creates directly in this group without adding a placeholder command. */
  function handleCreate(): void {
    onCreate(name);
  }

  /** Opens operations for this specific named group. */
  function handleMenu(event: MouseEvent<HTMLButtonElement>): void {
    setAnchor(event.currentTarget);
  }

  /** Starts an inline rename within the sidebar. */
  function handleRename(): void {
    setAnchor(null);
    setDraft(name);
    setEditing(true);
  }

  /** Returns every member to ungrouped; no command or running instance is deleted. */
  function handleDelete(): void {
    setAnchor(null);
    void store.groups.delete(name);
  }

  /** Saves a validated rename without optimistic membership edits. */
  async function handleSave(): Promise<void> {
    if (invalid || saving) return;
    if (await store.groups.rename(name, draft)) setEditing(false);
  }

  /** Supports keyboard editing without submitting a surrounding form. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSave();
    }
    if (event.key === "Escape") {
      event.stopPropagation();
      setEditing(false);
    }
  }

  let header = <>
    <ButtonBase onClick={onToggle} aria-expanded={expanded} aria-controls={id}
      sx={{ flex: 1, minWidth: 0, justifyContent: "flex-start", gap: 0.5, textAlign: "left", py: 0.75 }}>
      {expandIcon}<Typography variant="body2" noWrap title={name} sx={{ minWidth: 0, flex: 1 }}>{name}</Typography>
      <Typography variant="caption" color="text.secondary">{commands.length}</Typography>{activity}
    </ButtonBase>
    <Tooltip title={t("commands.addInGroup")} placement="left" disableInteractive>
      <span><IconButton size="small" onClick={handleCreate} aria-label={t("commands.addInGroup")} disabled={!store.isAvailable || saving}>
        <AddOutlinedIcon fontSize="small" />
      </IconButton></span>
    </Tooltip>
    <Tooltip title={t("commands.groupActions")} placement="left" disableInteractive>
      <span><IconButton size="small" onClick={handleMenu} aria-label={t("commands.groupActions")} disabled={saving}>
        <MoreVertOutlinedIcon fontSize="small" />
      </IconButton></span>
    </Tooltip>
  </>;
  if (editing) header = <>
    <TextField autoFocus size="small" value={draft} label={t("commands.groupName")} disabled={saving}
      error={duplicate} helperText={groupHelp}
      onChange={event => setDraft(event.target.value)} onKeyDown={handleKeyDown}
      slotProps={{ htmlInput: { maxLength: 100 } }} sx={{ flex: 1, minWidth: 0 }} />
    <IconButton size="small" aria-label={t("commands.save")} disabled={invalid || saving} onClick={() => void handleSave()}><CheckOutlinedIcon fontSize="small" /></IconButton>
    <IconButton size="small" aria-label={t("commands.cancel")} disabled={saving} onClick={() => setEditing(false)}><CloseOutlinedIcon fontSize="small" /></IconButton>
  </>;
  const empty = commands.length === 0 ? <Typography variant="caption" color="text.secondary">{t("commands.emptyGroup")}</Typography> : null;
  return <Box sx={{ minWidth: 0, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
    <Stack direction="row" sx={{ alignItems: "center", px: 0.5, minHeight: 32 }}>{header}</Stack>
    <Collapse in={expanded} unmountOnExit>
      <Stack id={id} spacing={0.5} sx={{ p: 0.5, pt: 0 }}>{empty}
        <ProjectCommandListX commands={commands} commandsStore={store} onEdit={onEdit} onOpenLogs={onOpenLogs} />
      </Stack>
    </Collapse>
    <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
      <MenuItem onClick={handleRename}>{t("commands.renameGroup")}</MenuItem>
      <MenuItem onClick={handleDelete} sx={{ color: "error.main" }}>
        <ListItemText primary={t("commands.deleteGroup")} secondary={t("commands.deleteGroupHelp")} />
      </MenuItem>
    </Menu>
  </Box>;
}

export const ProjectCommandGroupX = observer(ProjectCommandGroup);
