/**
 * Renders Git tag search, reference selection, and lightweight tag creation.
 */
import LocalOfferOutlinedIcon from "@mui/icons-material/LocalOfferOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexGitTag } from "@open-codex-ui/opencodex-protocol";

import type { ProjectGitStore } from "../../stores/ProjectGitStore";

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

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t("git.tagSelectorTitle")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField
            autoFocus
            fullWidth
            size="small"
            label={t("git.tagSearch")}
            value={searchTerm}
            disabled={gitStore.isCreatingTag || gitStore.isLoadingTagReference}
            onChange={handleSearchChange}
          />

          {gitStore.tagErrorMessage !== null ? (
            <Alert severity="error">{gitStore.tagErrorMessage}</Alert>
          ) : null}

          {gitStore.isLoadingTags ? (
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
                    <ListItemButton
                      key={tag.fullName}
                      selected={tag.name === gitStore.selectedReferenceTagName}
                      disabled={gitStore.isLoadingTagReference}
                      onClick={() => void handleSelectTag(tag.name)}
                    >
                      <ListItemIcon sx={{ minWidth: 34 }}>
                        <LocalOfferOutlinedIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText
                        primary={tag.name}
                        secondary={tag.createdAt ?? tag.targetHash}
                        slotProps={{
                          primary: { noWrap: true },
                          secondary: { noWrap: true }
                        }}
                      />
                    </ListItemButton>
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
