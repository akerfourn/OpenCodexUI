import { Alert, Button, CircularProgress, DialogActions, DialogContent, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SourceResourceSettings } from "@open-codex-ui/opencodex-protocol";
import type { SourceResourcesStore } from "../../stores/app/SourceResourcesStore";

/** Presents only detected host controls and keeps operational errors in the central journal. */
export function SourceResourcesPanel({ state, onClose }: { state: SourceResourcesStore; onClose(): void }) {
  const { t } = useTranslation();
  useEffect(() => { void state.load(); }, [state]);

  /** Updates only the priority field; the full policy is copied when saved. */
  function handlePriority(event: ChangeEvent<HTMLInputElement>): void {
    state.setPriority(event.target.value as SourceResourceSettings["priority"]);
  }
  /** Keeps invalid numeric text available for field validation. */
  function handleLimit(event: ChangeEvent<HTMLInputElement>): void { state.setCpuLimit(event.target.value); }
  /** Saves for the next source launch without interrupting a running chat. */
  function handleSubmit(event: FormEvent<HTMLFormElement>): void { event.preventDefault(); void state.save(); }

  const capabilities = state.snapshot?.capabilities;
  const busy = state.isLoading || state.isSaving;
  let content = <Button onClick={state.load} disabled={busy}>{t("sourceResources.retry")}</Button>;
  if (state.isLoading) content = <CircularProgress size={24} aria-label={t("sourceResources.loading")} />;
  if (state.snapshot !== null) {
    let unavailable = null;
    const reason = capabilities?.cpuLimitUnavailableReason;
    if (reason !== null && reason !== undefined) {
      unavailable = <Alert severity="info">{t(`sourceResources.${reason}`)}</Alert>;
    }
    let invalidLimit = "";
    let priorityUnavailable = null;
    if (capabilities?.priority !== true) {
      priorityUnavailable = <Typography variant="caption" color="text.secondary">{t("sourceResources.priorityUnavailable")}</Typography>;
    }
    if (!state.isValid) invalidLimit = t("sourceResources.invalidLimit");
    content = (
      <Stack spacing={2}>
        <Typography variant="body2" color="text.secondary">{t("sourceResources.scope")}</Typography>
        <TextField select fullWidth size="small" label={t("sourceResources.priority")} value={state.priority}
          disabled={busy || capabilities?.priority !== true} onChange={handlePriority}>
          <MenuItem value="normal">{t("sourceResources.normal")}</MenuItem>
          <MenuItem value="low">{t("sourceResources.low")}</MenuItem>
          <MenuItem value="idle">{t("sourceResources.idle")}</MenuItem>
        </TextField>
        <Typography variant="caption" color="text.secondary">{t("sourceResources.priorityHelp")}</Typography>
        {priorityUnavailable}
        <TextField fullWidth size="small" type="number" label={t("sourceResources.cpuLimit")}
          value={state.cpuLimit} onChange={handleLimit} disabled={busy || capabilities?.cpuLimit !== true}
          slotProps={{ htmlInput: { min: 1, max: 100, step: 1 } }} placeholder={t("sourceResources.unlimited")}
          error={!state.isValid} helperText={invalidLimit || t("sourceResources.cpuHelp")} />
        {unavailable}
        <Alert severity="info">{t("sourceResources.restartNotice")}</Alert>
      </Stack>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <DialogContent dividers>{content}</DialogContent>
      <DialogActions>
        <Button onClick={state.reset} disabled={busy || state.snapshot === null} sx={{ mr: "auto" }}>{t("sourceResources.reset")}</Button>
        <Button onClick={onClose} disabled={state.isSaving}>{t("sources.cancel")}</Button>
        <Button variant="contained" type="submit" disabled={busy || state.snapshot === null || !state.isValid || !state.hasChanges}>
          {t("sources.save")}
        </Button>
      </DialogActions>
    </form>
  );
}

export const SourceResourcesPanelX = observer(SourceResourcesPanel);
