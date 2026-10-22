import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { defaultWorkspaceRetentionDays, isWorkspaceRetention, maxWorkspaceRetentionDays } from
  "@open-codex-ui/opencodex-protocol";
import type { ProjectStore } from "../../stores/project/ProjectStore";

/** Edits a project-local draft; recommendations use only the policy confirmed by persistence. */
export function WorkspaceRetentionSettings({ project, disabled }: { project: ProjectStore; disabled: boolean }) {
  const { t } = useTranslation();
  const savedDays = project.project.preferences.workspaceRetention?.days;
  const effectiveDays = savedDays === undefined ? defaultWorkspaceRetentionDays : savedDays;
  const [enabled, setEnabled] = useState(effectiveDays !== null);
  const [draftDays, setDraftDays] = useState(String(effectiveDays ?? defaultWorkspaceRetentionDays));
  useEffect(() => {
    setEnabled(effectiveDays !== null);
    setDraftDays(String(effectiveDays ?? defaultWorkspaceRetentionDays));
  }, [effectiveDays]);
  const days = enabled ? Number(draftDays) : null;
  const valid = isWorkspaceRetention({ days });
  const unchanged = days === effectiveDays;
  let daysInput = null;
  if (enabled) {
    daysInput = <TextField type="number" label={t("workspaceRetention.days")} value={draftDays}
      onChange={event => setDraftDays(event.target.value)} disabled={disabled} error={!valid}
      helperText={t("workspaceRetention.range", { max: maxWorkspaceRetentionDays })}
      slotProps={{ htmlInput: { min: 1, max: maxWorkspaceRetentionDays, step: 1 } }} />;
  }

  /** Saves an isolated scalar patch without changing other project preferences. */
  async function handleSave(): Promise<void> {
    if (!valid || disabled || unchanged) return;
    await project.workspaces.setRetentionDays(days);
  }

  return <Stack spacing={1}>
    <Typography variant="subtitle2">{t("workspaceRetention.title")}</Typography>
    <Typography variant="body2" color="text.secondary">{t("workspaceRetention.help")}</Typography>
    <TextField select label={t("workspaceRetention.mode")} value={enabled ? "enabled" : "disabled"}
      onChange={event => setEnabled(event.target.value === "enabled")} disabled={disabled}>
      <MenuItem value="enabled">{t("workspaceRetention.enabled")}</MenuItem>
      <MenuItem value="disabled">{t("workspaceRetention.disabled")}</MenuItem>
    </TextField>
    {daysInput}
    <Button onClick={handleSave} disabled={disabled || !valid || unchanged}>{t("workspaceRetention.save")}</Button>
  </Stack>;
}

export const WorkspaceRetentionSettingsX = observer(WorkspaceRetentionSettings);
