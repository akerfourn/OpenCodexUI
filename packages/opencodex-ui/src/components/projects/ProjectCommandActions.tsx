import StarOutlinedIcon from "@mui/icons-material/StarOutlined";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import { Divider, IconButton, ListSubheader, Menu, MenuItem, Stack, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type { ProjectCommandsStore } from "../../stores/project/ProjectCommandsStore";

/** Compact vertical controls reveal on card hover/focus; the menu assigns groups and orders commands. */
export function ProjectCommandActions({ command, store, canMoveUp, canMoveDown, onEdit }: {
  command: OpenCodexProjectCommand; store: ProjectCommandsStore; canMoveUp: boolean; canMoveDown: boolean;
  onEdit(command: OpenCodexProjectCommand): void;
}) {
  const { t } = useTranslation();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const saving = store.isSaving || store.groups.isSaving;
  const favoriteLabel = t(command.isFavorite === true ? "commands.removeFavorite" : "commands.addFavorite");
  const favoriteIcon = command.isFavorite === true ? <StarOutlinedIcon /> : <StarBorderOutlinedIcon />;
  let className = "project-command-actions";
  if (anchor !== null) className += " is-open";

  /** Favorites retain their existing group so removing the star restores their placement. */
  function handleFavorite(): void {
    void store.toggleFavorite(command);
  }

  /** Opens the editor for this card independently of selection in the panel. */
  function handleEdit(): void {
    onEdit(command);
  }

  /** Keeps the action rail visible while its portalled menu owns keyboard focus. */
  function handleOpen(event: MouseEvent<HTMLButtonElement>): void {
    setAnchor(event.currentTarget);
  }

  /** Returns focus to the invoking card without changing membership. */
  function handleClose(): void {
    setAnchor(null);
  }

  /** Sends only fixed metadata identities and the selected group name. */
  function assign(name: string | null): void {
    setAnchor(null);
    void store.groups.assign(command, name);
  }

  /** Reorders inside the existing visible section. */
  function handleMoveUp(): void {
    setAnchor(null);
    void store.moveCommand(command.id, "up");
  }

  /** Reorders inside the existing visible section. */
  function handleMoveDown(): void {
    setAnchor(null);
    void store.moveCommand(command.id, "down");
  }

  const choices = store.groups.names.map(name => <MenuItem key={name} selected={command.groupName === name}
    disabled={saving} onClick={() => assign(name)}>{name}</MenuItem>);
  return <>
    <Stack className={className} spacing={0}>
      <Tooltip title={favoriteLabel} placement="left" disableInteractive>
        <span><IconButton onClick={handleFavorite} aria-label={favoriteLabel} aria-pressed={command.isFavorite === true}
          disabled={saving} color={command.isFavorite === true ? "warning" : "default"}>{favoriteIcon}</IconButton></span>
      </Tooltip>
      <Tooltip title={t("commands.edit")} placement="left" disableInteractive>
        <span><IconButton onClick={handleEdit} aria-label={t("commands.edit")} disabled={saving}><EditOutlinedIcon /></IconButton></span>
      </Tooltip>
      <Tooltip title={t("commands.actions")} placement="left" disableInteractive>
        <span><IconButton onClick={handleOpen} aria-label={t("commands.actions")} aria-haspopup="menu"
          aria-expanded={anchor !== null} disabled={saving}><MoreVertOutlinedIcon /></IconButton></span>
      </Tooltip>
    </Stack>
    <Menu anchorEl={anchor} open={anchor !== null} onClose={handleClose}>
      <ListSubheader>{t("commands.moveToGroup")}</ListSubheader>
      <MenuItem selected={command.groupName == null} disabled={saving} onClick={() => assign(null)}>{t("commands.ungrouped")}</MenuItem>
      {choices}
      <Divider />
      <MenuItem disabled={saving || !canMoveUp} onClick={handleMoveUp}>{t("commands.moveUp")}</MenuItem>
      <MenuItem disabled={saving || !canMoveDown} onClick={handleMoveDown}>{t("commands.moveDown")}</MenuItem>
    </Menu>
  </>;
}

export const ProjectCommandActionsX = observer(ProjectCommandActions);
