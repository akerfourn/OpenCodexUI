import { useEffect, type ChangeEvent } from "react";
import { Alert, Button, FormControlLabel, LinearProgress, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import { DICTATION_LANGUAGES, DICTATION_MODELS, type OpenCodexDictationSettings } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";
import { DictationError } from "../chat/DictationError";

/** Configures dictation independently from Codex model and conversation settings. */
export function HomeDictationSettings({ store }: { store: RootStore }) {
  const { t, i18n } = useTranslation();
  const dictation = store.dictationStore;
  const settings = dictation.settings;
  const state = dictation.modelState;
  const locked = dictation.busy || dictation.managing || state.downloadingModelId !== null;
  useEffect(() => { void dictation.load(); }, [dictation]);

  /** Persists activation without downloading a model or opening the microphone. */
  function handleEnabled(event: ChangeEvent<HTMLInputElement>): void {
    void dictation.updateSettings({ enabled: event.target.checked });
  }
  /** Selects a speech backend; the composer remains independent of its implementation. */
  function handleBackend(event: ChangeEvent<HTMLInputElement>): void {
    void dictation.updateSettings({ backend: event.target.value as OpenCodexDictationSettings["backend"] });
  }
  /** Selects a catalogue model but leaves installation to an explicit button. */
  function handleModel(event: ChangeEvent<HTMLInputElement>): void {
    void dictation.updateSettings({ modelId: event.target.value as OpenCodexDictationSettings["modelId"] });
  }
  /** Sets an optional language hint for the local recognizer. */
  function handleLanguage(event: ChangeEvent<HTMLInputElement>): void {
    void dictation.updateSettings({ language: event.target.value });
  }
  /** Explicitly replaces the single model installed on this computer. */
  function handleInstall(): void { void dictation.manageModel("install"); }
  /** Frees the installed model's disk space. */
  function handleRemove(): void { void dictation.manageModel("remove"); }
  /** Stops an unfinished download and removes its partial files. */
  function handleCancel(): void { void dictation.cancelDownload(); }
  /** Dismisses diagnostics without changing preferences. */
  function handleClearError(): void { dictation.clearError(); }

  let backendContent;
  if (settings.backend === "codex") {
    backendContent = <Alert severity="warning">{t("dictation.codexWarning")}</Alert>;
  } else {
    const names = new Intl.DisplayNames([i18n.resolvedLanguage ?? "en"], { type: "language" });
    const languages = DICTATION_LANGUAGES.map((language) => {
      const label = language === "auto" ? t("dictation.automatic") : names.of(language);
      return <MenuItem key={language} value={language}>{label}</MenuItem>;
    });
    const models = DICTATION_MODELS.map((model) => (
      <MenuItem key={model.id} value={model.id}>{model.label} — ≈ {model.downloadMegabytes} MB</MenuItem>
    ));
    const installed = DICTATION_MODELS.find((model) => model.id === state.installedModelId);
    let progressContent = null;
    if (state.downloadingModelId !== null) {
      progressContent = (
        <Stack spacing={1} aria-live="polite">
          <Typography variant="body2">{t("dictation.downloading")}</Typography>
          <LinearProgress variant="determinate" value={state.progress ?? 0} />
          <Button onClick={handleCancel}>{t("dictation.cancel")}</Button>
        </Stack>
      );
    }
    backendContent = (
      <Stack spacing={1.5}>
        <Typography variant="body2" color="text.secondary">{t("dictation.localDescription")}</Typography>
        <TextField select size="small" label={t("dictation.model")} value={settings.modelId} onChange={handleModel} disabled={locked}>
          {models}
        </TextField>
        <Typography variant="caption">{t("dictation.singleModel")}</Typography>
        <Typography variant="body2">{t("dictation.installed", { model: installed?.label ?? t("dictation.none") })}</Typography>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" onClick={handleInstall} disabled={locked || state.installedModelId === settings.modelId}>{t("dictation.download")}</Button>
          <Button onClick={handleRemove} disabled={locked || state.installedModelId === null}>{t("dictation.remove")}</Button>
        </Stack>
        {progressContent}
        <DictationError message={state.error} />
        <TextField select size="small" label={t("dictation.language")} value={settings.language} onChange={handleLanguage} disabled={locked}>
          {languages}
        </TextField>
      </Stack>
    );
  }

  return (
    <Stack spacing={1.5} sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 2 }}>
      <Typography variant="h6">{t("dictation.title")}</Typography>
      <FormControlLabel control={<Switch checked={settings.enabled} disabled={locked} onChange={handleEnabled} />} label={t("dictation.enabled")} />
      <TextField select size="small" label={t("dictation.backend")} value={settings.backend} onChange={handleBackend} disabled={locked}>
        <MenuItem value="local">{t("dictation.local")}</MenuItem>
        <MenuItem value="codex">{t("dictation.codex")}</MenuItem>
      </TextField>
      {backendContent}
      <DictationError message={dictation.error} onClose={handleClearError} />
    </Stack>
  );
}

export const HomeDictationSettingsX = observer(HomeDictationSettings);
