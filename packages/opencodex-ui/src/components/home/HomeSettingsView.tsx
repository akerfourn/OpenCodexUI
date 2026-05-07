/**
 * Renders application settings on the Home tab.
 */
import { MenuItem, Stack, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexLanguage } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";

type HomeSettingsViewProps = {
  store: RootStore;
};

/**
 * Renders the Home settings section.
 *
 * @param props Component props.
 *
 * @returns Rendered settings view.
 */
export function HomeSettingsView({ store }: HomeSettingsViewProps) {
  const { t } = useTranslation();

  function handleLanguageChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setLanguage(event.target.value as OpenCodexLanguage);
  }

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Typography variant="h5" component="h2">
        {t("home.settings")}
      </Typography>
      <TextField
        select
        value={store.settings.language}
        label={t("language.label")}
        fullWidth
        size="small"
        onChange={handleLanguageChange}
      >
        <MenuItem value="system">{t("language.system")}</MenuItem>
        <MenuItem value="fr">{t("language.fr")}</MenuItem>
        <MenuItem value="en">{t("language.en")}</MenuItem>
      </TextField>
    </Stack>
  );
}

export const HomeSettingsViewX = observer(HomeSettingsView);
