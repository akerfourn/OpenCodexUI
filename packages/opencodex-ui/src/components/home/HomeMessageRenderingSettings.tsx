import { useApplicationErrorReporter } from "../app/applicationErrorContext";
import { useState, type ChangeEvent } from "react";
import { FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import {
  normalizeMessageRenderingDefaults,
  type MessageRenderingDefaults, type MessageRenderingOptions, type OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../../stores/RootStore";

/** Sets role-specific global defaults while leaving per-message exceptions unchanged. */
export function HomeMessageRenderingSettings({ store }: { store: RootStore }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const reportError = useApplicationErrorReporter();
  const defaults = normalizeMessageRenderingDefaults(store.settings.messageRendering);

  /** Publishes confirmed defaults only after persistence succeeds. */
  async function change(role: keyof MessageRenderingDefaults, field: keyof MessageRenderingOptions,
    event: ChangeEvent<HTMLInputElement>): Promise<void> {
    if (saving) return;
    setSaving(true);
    const messageRendering = normalizeMessageRenderingDefaults(store.settings.messageRendering);
    messageRendering[role][field] = event.target.checked;
    try {
      const saved = await store.request<OpenCodexSettings>({ type: "settings.update", patch: { messageRendering } });
      store.appStore.settingsStore.replaceSettings({ ...store.settings, messageRendering: saved.messageRendering });
    } catch (reason) { reportError(reason); }
    finally { setSaving(false); }
  }

  const sections = (["user", "assistant"] as const).map(role => {
    const fields = (["markdown", "math"] as const).map(field => (
      <FormControlLabel key={field} label={t(`messageRendering.${field}`)} control={
        <Switch checked={defaults[role][field]} disabled={saving || (field === "math" && !defaults[role].markdown)}
          onChange={(event) => { void change(role, field, event); }} />
      } />
    ));
    return <Stack key={role} spacing={0.5}>
      <Typography variant="subtitle2">{t(`messageRendering.${role}`)}</Typography>
      <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap" }}>{fields}</Stack>
    </Stack>;
  });

  return <Stack spacing={1}>
    <Typography variant="h6">{t("messageRendering.globalTitle")}</Typography>
    <Typography variant="body2" color="text.secondary">{t("messageRendering.globalDescription")}</Typography>
    {sections}
  </Stack>;
}
export const HomeMessageRenderingSettingsX = observer(HomeMessageRenderingSettings);
