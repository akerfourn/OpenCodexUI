/**
 * Creates a source from a local draft without persisting an incomplete entry.
 */
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import type { OpenCodexSourceKind } from "@open-codex-ui/opencodex-protocol";
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import {
  buildSourceSettings,
  createSourceDraft,
  SourceConfigurationFields,
  SourceKindSelector,
  type SourceDraft,
  validateSourceDraft
} from "./sourceConfiguration";

type HomeSourceCreateDialogProps = {
  open: boolean;
  store: RootStore;
  onClose(): void;
};

/**
 * Renders the source creation dialog.
 *
 * @param props Dialog state, root store, and close callback.
 * @returns Source creation dialog.
 */
export function HomeSourceCreateDialog({ open, store, onClose }: HomeSourceCreateDialogProps) {
  const { t } = useTranslation();
  const [nameDraft, setNameDraft] = useState("Codex");
  const [draft, setDraft] = useState<SourceDraft>(() => createSourceDraft("local"));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    setNameDraft(t("sources.defaultNameLocal"));
    setDraft(createSourceDraft("local"));
    setErrorKey(null);
  }, [open, t]);

  function handleKindChange(kind: OpenCodexSourceKind): void {
    setDraft(createSourceDraft(kind));
    setNameDraft(t(getDefaultSourceNameKey(kind)));
    setErrorKey(null);
  }

  function handleNameChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setNameDraft(event.target.value);
  }

  function handleDraftChange(patch: Partial<SourceDraft>): void {
    if (patch.kind !== undefined && patch.kind !== draft.kind) {
      const currentDefaultName = t(getDefaultSourceNameKey(draft.kind));

      if (nameDraft.trim().length === 0 || nameDraft === currentDefaultName) {
        setNameDraft(t(getDefaultSourceNameKey(patch.kind)));
      }
    }

    setDraft((current) => ({ ...current, ...patch }));
    setErrorKey(null);
  }

  function handleClose(): void {
    if (isSubmitting) {
      return;
    }

    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const trimmedName = nameDraft.trim();

    if (trimmedName.length === 0) {
      setErrorKey("sources.validation.nameRequired");
      return;
    }

    const validationErrorKey = validateSourceDraft(draft);

    if (validationErrorKey !== null) {
      setErrorKey(validationErrorKey);
      return;
    }

    setIsSubmitting(true);
    void store.sourcesStore
      .createSource(trimmedName, draft.kind, buildSourceSettings(draft))
      .then(() => {
        onClose();
      })
      .catch(() => {
        setErrorKey("sources.createError");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  }

  const commandCandidates = store.sourcesStore.sources.find(
    (source) => source.commandCandidates.length > 0
  )?.commandCandidates ?? [];

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={handleClose}>
      <Stack component="form" onSubmit={handleSubmit}>
        <DialogTitle>{t("sources.createTitle")}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {errorKey !== null ? <Alert severity="error">{t(errorKey)}</Alert> : null}
            <TextField
              autoFocus
              required
              fullWidth
              size="small"
              value={nameDraft}
              label={t("sources.name")}
              onChange={handleNameChange}
            />
            <Stack spacing={0.5}>
              <Typography variant="subtitle2">{t("sources.kind")}</Typography>
              <SourceKindSelector value={draft.kind} onChange={handleKindChange} />
            </Stack>
            <SourceConfigurationFields
              draft={draft}
              onChange={handleDraftChange}
              store={store}
              commandCandidates={commandCandidates}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button type="button" onClick={handleClose} disabled={isSubmitting}>
            {t("sources.cancel")}
          </Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>
            {isSubmitting ? t("sources.creating") : t("sources.create")}
          </Button>
        </DialogActions>
      </Stack>
    </Dialog>
  );
}

/**
 * Returns the localized default name for a source kind.
 *
 * @param kind Source kind.
 * @returns Translation key for the default name.
 */
function getDefaultSourceNameKey(kind: OpenCodexSourceKind): string {
  switch (kind) {
    case "custom":
      return "sources.defaultNameCustom";
    case "wsl":
      return "sources.defaultNameWsl";
    case "ssh":
      return "sources.defaultNameSsh";
    default:
      return "sources.defaultNameLocal";
  }
}
