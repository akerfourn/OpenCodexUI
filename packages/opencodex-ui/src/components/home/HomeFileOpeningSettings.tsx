import { useState, type ChangeEvent } from "react";
import { Alert, MenuItem, Stack, TextField } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";

/** Selects the persisted default for file references, independently of explicit external actions. */
export function HomeFileOpeningSettings({ store }: { store: RootStore }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settings = store.appStore.settingsStore;
  /** Retains the old preference when persistence fails. */
  async function change(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const mode = event.target.value;
    if (saving || (mode !== "integrated" && mode !== "external")) return;
    setSaving(true);
    setError(null);
    try { await settings.setFileOpeningMode(mode); }
    catch (reason) { setError(String(reason)); }
    finally { setSaving(false); }
  }
  let feedback = null;
  if (error !== null) {
    feedback = <Alert severity="error">{t("files.openingSaveError")}
      <details><summary>{t("fileLanguages.details")}</summary>{error}</details>
    </Alert>;
  }
  return (
    <Stack spacing={1}>
      <TextField select fullWidth size="small" disabled={saving}
        label={t("files.openingMode")} value={settings.settings.fileOpeningMode ?? "integrated"}
        helperText={t("files.openingDescription")} onChange={change}>
        <MenuItem value="integrated">{t("files.openingIntegrated")}</MenuItem>
        <MenuItem value="external">{t("files.openingExternal")}</MenuItem>
      </TextField>
      {feedback}
    </Stack>
  );
}
export const HomeFileOpeningSettingsX = observer(HomeFileOpeningSettings);
