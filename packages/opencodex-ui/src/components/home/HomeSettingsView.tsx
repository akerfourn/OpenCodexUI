/**
 * Renders application settings on the Home tab.
 */
import { FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
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
  const appStore = store.appStore;

  function handleLanguageChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    appStore.setLanguage(event.target.value as OpenCodexLanguage);
  }

  function handleAllowTurnSteeringChange(event: ChangeEvent<HTMLInputElement>): void {
    appStore.setAllowTurnSteering(event.target.checked);
  }

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Typography variant="h5" component="h2">
        {t("home.settings")}
      </Typography>
      <TextField
        select
        value={appStore.settings.language}
        label={t("language.label")}
        fullWidth
        size="small"
        onChange={handleLanguageChange}
      >
        <MenuItem value="system">{t("language.system")}</MenuItem>
        <MenuItem value="fr">{t("language.fr")}</MenuItem>
        <MenuItem value="en">{t("language.en")}</MenuItem>
      </TextField>
      <FormControlLabel
        control={(
          <Switch
            checked={appStore.settings.allowTurnSteering}
            onChange={handleAllowTurnSteeringChange}
          />
        )}
        label={t("settings.allowTurnSteering")}
      />
      <Typography variant="body2" color="text.secondary">
        {t("settings.allowTurnSteeringDescription")}
      </Typography>
    </Stack>
  );
}

export const HomeSettingsViewX = observer(HomeSettingsView);
