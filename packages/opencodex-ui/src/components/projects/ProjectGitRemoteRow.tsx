import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import StarOutlinedIcon from "@mui/icons-material/StarOutlined";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import { IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type { OpenCodexGitRemote } from "@open-codex-ui/opencodex-protocol";

interface ProjectGitRemoteRowProps {
  remote: OpenCodexGitRemote;
  disabled: boolean;
  onEdit(remote: OpenCodexGitRemote): void;
  onRemove(remote: OpenCodexGitRemote): void;
  favorite?: boolean;
  onFavorite?(remote: OpenCodexGitRemote): void;
}

/** Shows one remote's addresses and actions alongside the other configured remotes. */
export function ProjectGitRemoteRow({ remote, disabled, onEdit, onRemove, favorite = false, onFavorite }: ProjectGitRemoteRowProps) {
  const { t } = useTranslation();
  /** Opens the editor for this row's remote. */
  function handleEdit(): void { onEdit(remote); }
  /** Requests a separate confirmation for this row's remote. */
  function handleRemove(): void { onRemove(remote); }
  /** Selects the default without changing any remote addresses or branch overrides. */
  function handleFavorite(): void { onFavorite?.(remote); }
  let favoriteAction = null;
  if (onFavorite !== undefined) {
    let icon = <StarBorderOutlinedIcon fontSize="small" />;
    if (favorite) icon = <StarOutlinedIcon color="warning" fontSize="small" />;
    favoriteAction = <Tooltip title={t("gitSync.favoriteAction", { name: remote.name })}>
      <span><IconButton size="small" disabled={disabled} onClick={handleFavorite}
        aria-label={t("gitSync.favoriteAction", { name: remote.name })} aria-pressed={favorite}>{icon}</IconButton></span>
    </Tooltip>;
  }
  let pushUrl = null;
  if (remote.pushUrl !== null && remote.pushUrl !== remote.fetchUrl) {
    pushUrl = <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
      {t("git.remotePushUrl")} : {remote.pushUrl}
    </Typography>;
  }

  return (
    <Paper component="section" variant="outlined" aria-label={remote.name} sx={{ p: 1.25 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Stack spacing={0.25} sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>{remote.name}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
            {t("git.remoteFetchUrl")} : {remote.fetchUrl ?? t("git.remoteUrlMissing")}
          </Typography>
          {pushUrl}
        </Stack>
        <Stack direction="row" spacing={0.25}>
          {favoriteAction}
          <Tooltip title={t("git.remoteEdit", { name: remote.name })}>
            <span><IconButton size="small" disabled={disabled} onClick={handleEdit}
              aria-label={t("git.remoteEdit", { name: remote.name })}><EditOutlinedIcon fontSize="small" /></IconButton></span>
          </Tooltip>
          <Tooltip title={t("git.remoteRemove", { name: remote.name })}>
            <span><IconButton size="small" color="error" disabled={disabled} onClick={handleRemove}
              aria-label={t("git.remoteRemove", { name: remote.name })}><DeleteOutlineOutlinedIcon fontSize="small" /></IconButton></span>
          </Tooltip>
        </Stack>
      </Stack>
    </Paper>
  );
}

export const ProjectGitRemoteRowX = observer(ProjectGitRemoteRow);
