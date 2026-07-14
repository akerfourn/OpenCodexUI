/**
 * Renders Git tag search, reference selection, and lightweight tag creation.
 */
import PublishOutlinedIcon from "@mui/icons-material/PublishOutlined";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent, MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexGitTag } from "@open-codex-ui/opencodex-protocol";

import type { ProjectGitStore } from "../../stores/ProjectGitStore";
import { ProjectTagListItem } from "./ProjectTagListItem";

type ProjectTagSelectorDialogProps = {
  gitStore: ProjectGitStore;
  open: boolean;
  onClose(): void;
};

/**
 * Renders the tag selector dialog.
 *
 * @param props Component props.
 *
 * @returns Rendered dialog.
 */
export function ProjectTagSelectorDialog({
  gitStore,
  open,
  onClose
}: ProjectTagSelectorDialogProps) {
  const { t } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [tagMenuAnchor, setTagMenuAnchor] = useState<HTMLElement | null>(null);
  const [tagMenuName, setTagMenuName] = useState<string | null>(null);
  const [forceTagName, setForceTagName] = useState<string | null>(null);
  const [isForceConfirmed, setIsForceConfirmed] = useState(false);
  const normalizedSearchTerm = searchTerm.trim();
  const filteredTags = useMemo(
    () => filterTags(gitStore.tags, normalizedSearchTerm),
    [gitStore.tags, normalizedSearchTerm]
  );
  const canCreateTag = canCreateTagFromInput(gitStore.tags, normalizedSearchTerm);

  useEffect(() => {
    if (open) {
      setSearchTerm("");
      void gitStore.loadTags();
    }
  }, [gitStore, open]);

  function handleSearchChange(event: ChangeEvent<HTMLInputElement>): void {
    setSearchTerm(event.target.value);
  }

  async function handleSelectTag(tagName: string): Promise<void> {
    const didSelect = await gitStore.selectReferenceTag(tagName);

    if (didSelect) {
      onClose();
    }
  }

  async function handleCreateTag(): Promise<void> {
    const didCreate = await gitStore.createTag(normalizedSearchTerm);

    if (didCreate) {
      onClose();
    }
  }

  function handleFetchTags(): void {
    void gitStore.fetchTags();
  }

  function handlePushTags(): void {
    void gitStore.pushTags();
  }

  function handlePushTag(tagName: string): void {
    void gitStore.pushTag(tagName);
  }

  function handleOpenTagMenu(event: MouseEvent<HTMLButtonElement>, tagName: string): void {
    event.stopPropagation();
    setTagMenuAnchor(event.currentTarget);
    setTagMenuName(tagName);
  }

  function handleCloseTagMenu(): void {
    setTagMenuAnchor(null);
    setTagMenuName(null);
  }

  function handleRequestForcePush(): void {
    if (tagMenuName === null) {
      return;
    }

    setForceTagName(tagMenuName);
    setIsForceConfirmed(false);
    handleCloseTagMenu();
  }

  function handleCloseForcePush(): void {
    if (gitStore.pushingTagName !== null) {
      return;
    }

    setForceTagName(null);
    setIsForceConfirmed(false);
  }

  function handleForceConfirmationToggle(): void {
    setIsForceConfirmed((current) => !current);
  }

  async function handleConfirmForcePush(): Promise<void> {
    if (forceTagName === null || !isForceConfirmed) {
      return;
    }

    const didPush = await gitStore.pushTag(forceTagName, true);

    if (didPush) {
      handleCloseForcePush();
    }
  }

  const isTagOperationBusy = gitStore.pushingTagName !== null ||
    gitStore.isPushingAllTags ||
    gitStore.isFetchingTags ||
    gitStore.isLoadingTags ||
    gitStore.isCreatingTag;

  return (
    <>
      <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
        <DialogTitle>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
              {t("git.tagSelectorTitle")}
            </Box>
            <Tooltip title={t("git.fetchTags")}>
              <span>
                <IconButton
                  aria-label={t("git.fetchTags")}
                  size="small"
                  disabled={!gitStore.isAvailable || !gitStore.status.isRepository || isTagOperationBusy}
                  onClick={handleFetchTags}
                >
                  {gitStore.isFetchingTags ? (
                    <CircularProgress size={18} />
                  ) : (
                    <SyncOutlinedIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title={t("git.pushTags")}>
              <span>
                <IconButton
                  aria-label={t("git.pushTags")}
                  size="small"
                  disabled={!gitStore.canPushTags || gitStore.isPushingAllTags}
                  onClick={handlePushTags}
                >
                  {gitStore.isPushingAllTags ? (
                    <CircularProgress size={18} />
                  ) : (
                    <PublishOutlinedIcon fontSize="small" />
                  )}
                </IconButton>
              </span>
            </Tooltip>
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label={t("git.tagSearch")}
              value={searchTerm}
              disabled={gitStore.isCreatingTag || gitStore.isLoadingTagReference || isTagOperationBusy}
              onChange={handleSearchChange}
            />

            {gitStore.tagErrorMessage !== null ? (
              <Alert severity="error">{gitStore.tagErrorMessage}</Alert>
            ) : null}
            {gitStore.tagSyncErrorMessage !== null ? (
              <Alert severity="warning">{gitStore.tagSyncErrorMessage}</Alert>
            ) : null}

            {gitStore.isLoadingTags || gitStore.isFetchingTags ? (
              <Box sx={{ display: "flex", justifyContent: "center", py: 3 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <Stack spacing={1}>
                {canCreateTag ? (
                  <Button
                    variant="text"
                    size="small"
                    disabled={gitStore.isCreatingTag}
                    onClick={handleCreateTag}
                    sx={{ alignSelf: "flex-start" }}
                  >
                    {t("git.createTag", { name: normalizedSearchTerm })}
                  </Button>
                ) : null}

                {filteredTags.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    {t("git.noTags")}
                  </Typography>
                ) : (
                  <List dense disablePadding>
                    {filteredTags.map((tag) => (
                      <ProjectTagListItem
                        key={tag.fullName}
                        tag={tag}
                        remoteName={gitStore.tagsRemoteName}
                        isOperationBusy={isTagOperationBusy}
                        canPush={gitStore.canPushTag(tag)}
                        isPushing={gitStore.isPushingTag(tag.name)}
                        isSelected={tag.name === gitStore.selectedReferenceTagName}
                        onSelect={() => void handleSelectTag(tag.name)}
                        onPush={() => handlePushTag(tag.name)}
                        onOpenMenu={handleOpenTagMenu}
                      />
                    ))}
                  </List>
                )}
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t("git.close")}</Button>
        </DialogActions>
      </Dialog>

      <Menu
        anchorEl={tagMenuAnchor}
        open={tagMenuAnchor !== null}
        onClose={handleCloseTagMenu}
      >
        <MenuItem
          disabled={tagMenuName === null || gitStore.tagsRemoteName === null || isTagOperationBusy}
          onClick={handleRequestForcePush}
        >
          {t("git.forcePushTag")}
        </MenuItem>
      </Menu>

      <Dialog
        open={forceTagName !== null}
        fullWidth
        maxWidth="sm"
        onClose={handleCloseForcePush}
      >
        <DialogTitle>{t("git.forcePushTagTitle")}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <Typography variant="body2">
              {t("git.forcePushTagDescription", {
                name: forceTagName ?? "",
                remote: gitStore.tagsRemoteName ?? "origin"
              })}
            </Typography>
            <Alert severity="warning">
              {t("git.forcePushTagWarning")}
            </Alert>
            <FormControlLabel
              control={
                <Checkbox
                  checked={isForceConfirmed}
                  onChange={handleForceConfirmationToggle}
                />
              }
              label={t("git.forcePushTagConfirmation")}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseForcePush}>{t("git.close")}</Button>
          <Button
            color="error"
            variant="contained"
            disabled={!isForceConfirmed || isTagOperationBusy}
            onClick={() => void handleConfirmForcePush()}
          >
            {t("git.forcePushTag")}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

export const ProjectTagSelectorDialogX = observer(ProjectTagSelectorDialog);

function filterTags(tags: OpenCodexGitTag[], searchTerm: string): OpenCodexGitTag[] {
  if (searchTerm.length === 0) {
    return tags;
  }

  const normalizedSearchTerm = searchTerm.toLowerCase();
  return tags.filter((tag) => (
    tag.name.toLowerCase().includes(normalizedSearchTerm) ||
    tag.fullName.toLowerCase().includes(normalizedSearchTerm)
  ));
}

function canCreateTagFromInput(tags: OpenCodexGitTag[], searchTerm: string): boolean {
  if (searchTerm.length === 0) {
    return false;
  }

  return !tags.some((tag) => tag.name === searchTerm);
}
