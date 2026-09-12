/** Renders the application log storage policy editor. */
import SaveOutlinedIcon from "@mui/icons-material/SaveOutlined";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { AppSettingsStore } from "../../stores/app/AppSettingsStore";
import {
  createLogPolicyDraft,
  LOG_POLICY_CATEGORIES,
  type LogPolicyCategory,
  type LogPolicyDraft,
  type LogPolicyDraftErrors,
  toOpenCodexLogPolicies,
  validateLogPolicyDraft
} from "./homeLogPolicyDraft";
import { HomeLogPolicyRow } from "./HomeLogPolicyRow";

type HomeLogPolicyDialogProps = {
  store: AppSettingsStore;
  open: boolean;
  onClose(): void;
};

type PolicyField = "maxEntries" | "retentionDays";

/** Renders the two supported application log policy rows. */
export function HomeLogPolicyDialog({ store, open, onClose }: HomeLogPolicyDialogProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<LogPolicyDraft>(() => createLogPolicyDraft(store.settings.logPolicies));
  const [validationErrors, setValidationErrors] = useState<LogPolicyDraftErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const policyRows = LOG_POLICY_CATEGORIES.map((category) => (
    <HomeLogPolicyRow
      key={category}
      category={category}
      policy={draft[category]}
      errors={validationErrors[category]}
      isSaving={isSaving}
      onModeChange={handleModeChange}
      onNumberChange={handleNumberChange}
    />
  ));
  const saveButtonIcon = isSaving
    ? <CircularProgress color="inherit" size={16} />
    : <SaveOutlinedIcon />;
  const saveErrorContent = saveError === null ? null : <Alert severity="error">{saveError}</Alert>;

  useEffect(() => {
    if (!open) {
      return;
    }

    setDraft(createLogPolicyDraft(store.settings.logPolicies));
    setValidationErrors({});
    setSaveError(null);
  }, [open, store]);

  /** Discards the draft when the dialog is dismissed outside a save operation. */
  function handleClose(): void {
    if (!isSaving) {
      onClose();
    }
  }

  /** Applies a selected storage mode to one draft row. */
  function handleModeChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    const category = readCategory(event.target.name);

    if (category === null) {
      return;
    }

    setDraft((current) => ({
      ...current,
      [category]: { ...current[category], mode: event.target.value as LogPolicyDraft[LogPolicyCategory]["mode"] }
    }));
    clearErrors(category);
  }

  /** Keeps an empty numeric input empty so validation can explain the error. */
  function handleNumberChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    const field = readPolicyField(event.target.name);

    if (field === null) {
      return;
    }

    const value = event.target.value === "" ? "" : Number(event.target.value);
    setDraft((current) => ({
      ...current,
      [field.category]: { ...current[field.category], [field.field]: value }
    }));
    clearErrors(field.category);
  }

  /** Validates the draft and persists it through the pessimistic settings action. */
  async function handleSave(): Promise<void> {
    const errors = validateLogPolicyDraft(draft);
    setValidationErrors(errors);
    setSaveError(null);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const policies = toOpenCodexLogPolicies(draft);

    if (policies === null) {
      return;
    }

    setIsSaving(true);

    try {
      await store.setLogPolicies(policies);
      onClose();
    } catch (error: unknown) {
      setSaveError(readSaveError(error, t("logs.policySaveError")));
    } finally {
      setIsSaving(false);
    }
  }

  /** Starts validation and persistence from the button click without awaiting in JSX. */
  function handleSaveClick(): void {
    void handleSave();
  }

  /** Clears row validation and a previous request error after an edit. */
  function clearErrors(category: LogPolicyCategory): void {
    setValidationErrors((current) => {
      if (current[category] === undefined) {
        return current;
      }

      const next = { ...current };
      delete next[category];
      return next;
    });
    setSaveError(null);
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("logs.policySettings")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {t("logs.policySettingsDescription")}
          </Typography>
          {policyRows}
          <Alert severity="info" variant="outlined">{t("logs.policyPersistenceNote")}</Alert>
          {saveErrorContent}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button type="button" onClick={handleClose} disabled={isSaving}>
          {t("logs.cancel")}
        </Button>
        <Button
          type="button"
          variant="contained"
          onClick={handleSaveClick}
          disabled={isSaving}
          startIcon={saveButtonIcon}
        >
          {t("logs.savePolicies")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export const HomeLogPolicyDialogX = observer(HomeLogPolicyDialog);

/** Reads a policy category from a form control name. */
function readCategory(value: string): LogPolicyCategory | null {
  return LOG_POLICY_CATEGORIES.includes(value as LogPolicyCategory)
    ? value as LogPolicyCategory
    : null;
}

/** Reads a numeric policy field and its category from a form control name. */
function readPolicyField(value: string): { category: LogPolicyCategory; field: PolicyField } | null {
  const [categoryValue, fieldValue] = value.split(".");
  const category = readCategory(categoryValue ?? "");

  if (category === null || (fieldValue !== "maxEntries" && fieldValue !== "retentionDays")) {
    return null;
  }

  return { category, field: fieldValue };
}

/** Converts unknown request failures into an inline message with a localized fallback. */
function readSaveError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.length > 0
    ? error.message
    : fallback;
}
