import DeleteOutlineOutlinedIcon from "@mui/icons-material/DeleteOutlineOutlined";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField
} from "@mui/material";
import type { ChangeEvent, FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexCommandCandidate } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";
import { SourceConfigurationFields, type SourceDraft } from "./sourceConfiguration";

type EditSourceDialogProps = {
  open: boolean;
  name: string;
  draft: SourceDraft;
  store: RootStore;
  commandCandidates: OpenCodexCommandCandidate[];
  selectedCommand: string;
  isDefault: boolean;
  isDeleting: boolean;
  onNameChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void;
  onDraftChange(patch: Partial<SourceDraft>): void;
  onClose(): void;
  onSubmit(event: FormEvent<HTMLFormElement>): void;
  onDelete(): void;
};

/** Renders the source editing form and its destructive-action entry point. */
export function EditSourceDialog({
  open,
  name,
  draft,
  store,
  commandCandidates,
  selectedCommand,
  isDefault,
  isDeleting,
  onNameChange,
  onDraftChange,
  onClose,
  onSubmit,
  onDelete
}: EditSourceDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <Box component="form" onSubmit={onSubmit}>
        <DialogTitle>{t("sources.editTitle")}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              value={name}
              label={t("sources.name")}
              onChange={onNameChange}
            />
            <SourceConfigurationFields
              draft={draft}
              onChange={onDraftChange}
              store={store}
              commandCandidates={commandCandidates}
              selectedCommand={selectedCommand}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          {!isDefault ? (
            <Button
              type="button"
              color="error"
              startIcon={<DeleteOutlineOutlinedIcon />}
              disabled={isDeleting}
              onClick={onDelete}
              sx={{ mr: "auto" }}
            >
              {t("sources.delete")}
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            {t("sources.cancel")}
          </Button>
          <Button variant="contained" type="submit">
            {t("sources.save")}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
