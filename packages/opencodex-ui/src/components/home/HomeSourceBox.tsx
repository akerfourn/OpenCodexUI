/**
 * Renders one Codex source card and its edit dialog.
 */
import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import StarRoundedIcon from "@mui/icons-material/StarRounded";
import SyncOutlinedIcon from "@mui/icons-material/SyncOutlined";
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexSource,
  OpenCodexSourceCommandMode
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";

type HomeSourceBoxProps = {
  source: OpenCodexSource;
  store: RootStore;
  isDefault: boolean;
  isEditing: boolean;
  onEdit(sourceId: string): void;
  onCloseEdit(): void;
};

/**
 * Renders one source summary card.
 *
 * @param props Component props.
 * @returns Rendered source card.
 */
export function HomeSourceBox({
  source,
  store,
  isDefault,
  isEditing,
  onEdit,
  onCloseEdit
}: HomeSourceBoxProps) {
  const { t } = useTranslation();
  const [nameDraft, setNameDraft] = useState(source.name);
  const [commandModeDraft, setCommandModeDraft] = useState(source.settings.commandMode);
  const [commandDraft, setCommandDraft] = useState(source.settings.command ?? "");
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [isDeleteConfirmed, setIsDeleteConfirmed] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isSyncing = store.isSourceSyncing(source.id);

  useEffect(() => {
    setNameDraft(source.name);
    setCommandModeDraft(source.settings.commandMode);
    setCommandDraft(source.settings.command ?? "");
  }, [source.settings.command, source.settings.commandMode, source.name]);

  function handleEdit(): void {
    onEdit(source.id);
  }

  function handleSyncSource(): void {
    store.syncSource(source.id);
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setNameDraft(event.target.value);
  }

  function handleModeChange(event: ChangeEvent<HTMLInputElement>): void {
    setCommandModeDraft(event.target.value as OpenCodexSourceCommandMode);
  }

  function handleCommandChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setCommandDraft(event.target.value);
  }

  function handlePickExecutable(): void {
    void store.pickSourceExecutablePath().then((path) => {
      if (path !== null) {
        setCommandDraft(path);
        setCommandModeDraft("custom");
      }
    });
  }

  function handleCloseEdit(): void {
    resetDeleteState();
    onCloseEdit();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    store.updateSource(source.id, {
      name: nameDraft,
      settings: {
        commandMode: commandModeDraft,
        command: commandDraft
      }
    });
    onCloseEdit();
  }

  function handleDelete(): void {
    if (isDefault || isDeleting) {
      return;
    }

    if (source.associatedProjectCount > 0) {
      setIsDeleteConfirmationOpen(true);
      return;
    }

    void deleteSource();
  }

  function handleDeleteConfirmationToggle(): void {
    setIsDeleteConfirmed((current) => !current);
  }

  function handleCancelDelete(): void {
    resetDeleteState();
  }

  function handleConfirmDelete(): void {
    if (!isDeleteConfirmed) {
      return;
    }

    void deleteSource();
  }

  async function deleteSource(): Promise<void> {
    setIsDeleting(true);

    try {
      await store.deleteSource(source.id);
      resetDeleteState();
      onCloseEdit();
    } finally {
      setIsDeleting(false);
    }
  }

  function resetDeleteState(): void {
    setIsDeleteConfirmationOpen(false);
    setIsDeleteConfirmed(false);
  }

  return (
    <Box
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: 1,
        p: 2,
        "&:hover .source-edit-action": {
          opacity: 1
        },
        "& .source-edit-action:focus-visible": {
          opacity: 1
        }
      }}
    >
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start" }}>
        {isDefault ? (
          <Tooltip title={t("sources.defaultSource")}>
            <StarRoundedIcon color="warning" fontSize="small" sx={{ mt: 0.25 }} />
          </Tooltip>
        ) : null}
        <Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
          <Typography variant="subtitle1" component="h3" noWrap>
            {source.name}
          </Typography>
          <Typography variant="body2" color="text.secondary" noWrap>
            {source.resolvedCommand}
          </Typography>
        </Box>
        <Tooltip title={t("sources.edit")}>
          <IconButton
            className="source-edit-action"
            size="small"
            aria-label={t("sources.edit")}
            onClick={handleEdit}
            sx={{ opacity: 0, transition: "opacity 120ms ease" }}
          >
            <EditOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title={t("sources.sync")}>
          <span>
            <IconButton
              size="small"
              aria-label={t("sources.sync")}
              disabled={isSyncing}
              onClick={handleSyncSource}
            >
              <SyncOutlinedIcon
                fontSize="small"
                sx={{
                  animation: isSyncing ? "source-sync-spin 1s linear infinite" : "none",
                  "@keyframes source-sync-spin": {
                    from: { transform: "rotate(0deg)" },
                    to: { transform: "rotate(-360deg)" }
                  }
                }}
              />
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      <Dialog open={isEditing} fullWidth maxWidth="sm" onClose={handleCloseEdit}>
        <Box component="form" onSubmit={handleSubmit}>
          <DialogTitle>{t("sources.editTitle")}</DialogTitle>
          <DialogContent dividers>
            <Stack spacing={2}>
              <TextField
                autoFocus
                size="small"
                value={nameDraft}
                label={t("sources.name")}
                onChange={handleNameChange}
              />
              <RadioGroup row value={commandModeDraft} onChange={handleModeChange}>
                <FormControlLabel value="auto" control={<Radio />} label={t("sources.auto")} />
                <FormControlLabel value="custom" control={<Radio />} label={t("sources.custom")} />
              </RadioGroup>
              <TextField
                size="small"
                value={source.resolvedCommand}
                label={t("sources.resolvedCommand")}
                disabled
              />
              {commandModeDraft === "custom" ? (
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                  <TextField
                    size="small"
                    fullWidth
                    value={commandDraft}
                    label={t("sources.command")}
                    onChange={handleCommandChange}
                  />
                  <Button
                    type="button"
                    variant="outlined"
                    startIcon={<FolderOpenOutlinedIcon />}
                    onClick={handlePickExecutable}
                    sx={{ flex: "0 0 auto" }}
                  >
                    {t("sources.pickExecutable")}
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          </DialogContent>
          <DialogActions>
            {!isDefault ? (
              <Button
                type="button"
                color="error"
                startIcon={<DeleteOutlineOutlinedIcon />}
                disabled={isDeleting}
                onClick={handleDelete}
                sx={{ mr: "auto" }}
              >
                {t("sources.delete")}
              </Button>
            ) : null}
            <Button type="button" onClick={handleCloseEdit}>
              {t("sources.cancel")}
            </Button>
            <Button variant="contained" type="submit">
              {t("sources.save")}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={isDeleteConfirmationOpen} fullWidth maxWidth="sm" onClose={handleCancelDelete}>
        <DialogTitle>{t("sources.deleteTitle")}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {t("sources.deleteDescription", { count: source.associatedProjectCount })}
          </Typography>
          <FormControlLabel
            control={<Checkbox checked={isDeleteConfirmed} onChange={handleDeleteConfirmationToggle} />}
            label={t("sources.deleteConfirmCheckbox")}
          />
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={handleCancelDelete}>
            {t("sources.cancel")}
          </Button>
          <Button
            type="button"
            variant="contained"
            color="error"
            disabled={!isDeleteConfirmed || isDeleting}
            onClick={handleConfirmDelete}
          >
            {t("sources.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export const HomeSourceBoxX = observer(HomeSourceBox);
