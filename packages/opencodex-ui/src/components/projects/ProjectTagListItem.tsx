/**
 * Renders one Git tag with remote synchronization and publication actions.
 */
import CloudDoneOutlinedIcon from "@mui/icons-material/CloudDoneOutlined";
import CloudOffOutlinedIcon from "@mui/icons-material/CloudOffOutlined";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import MoreVertOutlinedIcon from "@mui/icons-material/MoreVertOutlined";
import {
  Box,
  CircularProgress,
  IconButton,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexGitTag,
  OpenCodexGitTagSyncStatus
} from "@open-codex-ui/opencodex-protocol";

export type ProjectTagListItemProps = {
  tag: OpenCodexGitTag;
  remoteName: string | null;
  isOperationBusy: boolean;
  canPush: boolean;
  isPushing: boolean;
  isSelected: boolean;
  onSelect(): void;
  onPush(): void;
  onOpenMenu(event: MouseEvent<HTMLButtonElement>, tagName: string): void;
};

/**
 * Renders one selectable tag with synchronization and publication actions.
 *
 * @param props Tag row state and callbacks.
 * @returns Rendered tag row.
 */
export function ProjectTagListItem({
  tag,
  remoteName,
  isOperationBusy,
  canPush,
  isPushing,
  isSelected,
  onSelect,
  onPush,
  onOpenMenu
}: ProjectTagListItemProps) {
  const { t } = useTranslation();
  const syncLabel = readTagSyncLabel(tag.syncStatus, remoteName, t);
  const canOpenMenu = remoteName !== null;
  const hasPublishableStatus = tag.syncStatus === "local-only" || tag.syncStatus === "diverged";
  const pushColor = tag.syncStatus === "diverged" ? "error" : "warning";
  let syncContent = (
    <Tooltip title={syncLabel}>
      <Box component="span" aria-label={syncLabel} sx={{ display: "inline-flex", alignItems: "center" }}>
        {readTagSyncIcon(tag.syncStatus)}
      </Box>
    </Tooltip>
  );

  /** Publishes the tag without selecting its row or closing the selector. */
  function handlePush(event: MouseEvent<HTMLButtonElement>): void {
    event.stopPropagation();
    onPush();
  }

  if ((remoteName !== null && hasPublishableStatus) || isPushing) {
    let pushIcon = readTagSyncIcon(tag.syncStatus);
    if (isPushing) {
      pushIcon = <CircularProgress size={17} color="inherit" />;
    }
    syncContent = (
      <Tooltip title={`${syncLabel} · ${t("git.pushTag")}`}>
        <span>
          <IconButton
            edge="end"
            size="small"
            color={pushColor}
            disabled={!canPush || isOperationBusy || isPushing}
            aria-label={t("git.pushTag")}
            onClick={handlePush}
          >
            {pushIcon}
          </IconButton>
        </span>
      </Tooltip>
    );
  }

  return (
    <ListItem
      disablePadding
      secondaryAction={
        <Stack direction="row" spacing={0.25} sx={{ alignItems: "center", pr: 0.5 }}>
          {syncContent}
          <Tooltip title={t("git.tagActions")}>
            <span>
              <IconButton
                edge="end"
                size="small"
                disabled={!canOpenMenu || isOperationBusy}
                aria-label={t("git.tagActions")}
                onClick={(event) => onOpenMenu(event, tag.name)}
              >
                <MoreVertOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      }
    >
      <ListItemButton
        selected={isSelected}
        disabled={isOperationBusy}
        onClick={onSelect}
        sx={{ pr: 10 }}
      >
        <ListItemIcon sx={{ minWidth: 34 }}>
          <LocalOfferOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <ListItemText
          primary={tag.name}
          secondary={`${tag.createdAt ?? formatHash(tag.targetHash)} · ${syncLabel}`}
          slotProps={{
            primary: { noWrap: true },
            secondary: { noWrap: true }
          }}
        />
      </ListItemButton>
    </ListItem>
  );
}

export const ProjectTagListItemX = observer(ProjectTagListItem);

/**
 * Selects the icon associated with a tag synchronization state.
 *
 * @param status Synchronization state.
 * @returns Colored synchronization icon.
 */
function readTagSyncIcon(status: OpenCodexGitTagSyncStatus) {
  if (status === "synced") {
    return <CloudDoneOutlinedIcon color="success" fontSize="small" />;
  }

  if (status === "local-only") {
    return <CloudUploadOutlinedIcon color="warning" fontSize="small" />;
  }

  if (status === "diverged") {
    return <ErrorOutlineOutlinedIcon color="error" fontSize="small" />;
  }

  return <CloudOffOutlinedIcon color="disabled" fontSize="small" />;
}

/**
 * Creates the translated synchronization label for a tag.
 *
 * @param status Synchronization state.
 * @param remoteName Compared remote name.
 * @param translate Translation function.
 * @returns User-facing synchronization label.
 */
function readTagSyncLabel(
  status: OpenCodexGitTagSyncStatus,
  remoteName: string | null,
  translate: (key: string, options?: Record<string, unknown>) => string
): string {
  const remote = remoteName ?? "origin";

  if (status === "synced") {
    return translate("git.tagSynced", { remote });
  }

  if (status === "local-only") {
    return translate("git.tagLocalOnly", { remote });
  }

  if (status === "diverged") {
    return translate("git.tagDiverged", { remote });
  }

  return translate("git.tagSyncUnknown", { remote });
}

/**
 * Shortens a tag object hash for the fallback metadata line.
 *
 * @param hash Full or short hash.
 * @returns Compact hash or a placeholder.
 */
function formatHash(hash: string | null): string {
  if (hash === null || hash.length === 0) {
    return "—";
  }

  return hash.slice(0, 10);
}
