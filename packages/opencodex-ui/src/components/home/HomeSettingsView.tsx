/**
 * Renders application settings on the Home tab.
 */
import { Alert, Box, Button, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexColorScheme,
  OpenCodexEnterKeyBehavior,
  OpenCodexLanguage,
  OpenCodexVersioningVocabulary
} from "@open-codex-ui/opencodex-protocol";

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

  function handleColorSchemeChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    appStore.setColorScheme(event.target.value as OpenCodexColorScheme);
  }

  function handleAllowTurnSteeringChange(event: ChangeEvent<HTMLInputElement>): void {
    appStore.setAllowTurnSteering(event.target.checked);
  }

  function handleAllowOutdatedCodexChange(event: ChangeEvent<HTMLInputElement>): void {
    appStore.setAllowOutdatedCodex(event.target.checked);
  }

  function handleDeveloperModeChange(event: ChangeEvent<HTMLInputElement>): void {
    appStore.setDeveloperMode(event.target.checked);
  }

  function handleOpenDeveloperTools(): void {
    appStore.openDeveloperTools();
  }

  function handleDiscordRichPresenceChange(event: ChangeEvent<HTMLInputElement>): void {
    appStore.setDiscordRichPresenceEnabled(event.target.checked);
  }

  function handleDiscordReconnect(): void {
    appStore.reconnectDiscordRichPresence();
  }

  function handleEnterKeyBehaviorChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    appStore.setEnterKeyBehavior(event.target.value as OpenCodexEnterKeyBehavior);
  }

  function handleVersioningVocabularyChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    appStore.setVersioningVocabulary(event.target.value as OpenCodexVersioningVocabulary);
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
      <TextField
        select
        value={appStore.settings.colorScheme}
        label={t("theme.label")}
        fullWidth
        size="small"
        onChange={handleColorSchemeChange}
      >
        <MenuItem value="system">{t("theme.system")}</MenuItem>
        <MenuItem value="light">{t("theme.light")}</MenuItem>
        <MenuItem value="dark">{t("theme.dark")}</MenuItem>
      </TextField>
      <Stack spacing={0.5}>
        <TextField
          select
          value={appStore.settings.enterKeyBehavior}
          label={t("settings.enterKeyBehavior")}
          fullWidth
          size="small"
          onChange={handleEnterKeyBehaviorChange}
        >
          <MenuItem value="newline">{t("settings.enterKeyBehaviorOptions.newline")}</MenuItem>
          <MenuItem value="send">{t("settings.enterKeyBehaviorOptions.send")}</MenuItem>
          <MenuItem value="smart">{t("settings.enterKeyBehaviorOptions.smart")}</MenuItem>
        </TextField>
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
          {t(`settings.enterKeyBehaviorDescriptions.${appStore.settings.enterKeyBehavior}`)}
        </Typography>
      </Stack>
      <Stack spacing={0.5}>
        <TextField
          select
          value={appStore.settings.versioningVocabulary}
          label={t("settings.versioningVocabulary")}
          fullWidth
          size="small"
          onChange={handleVersioningVocabularyChange}
        >
          <MenuItem value="simple">{t("settings.versioningVocabularyOptions.simple")}</MenuItem>
          <MenuItem value="technical">{t("settings.versioningVocabularyOptions.technical")}</MenuItem>
        </TextField>
        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
          {t(`settings.versioningVocabularyDescriptions.${appStore.settings.versioningVocabulary}`)}
        </Typography>
      </Stack>
      <FormControlLabel
        sx={{ alignItems: "flex-start", m: 0 }}
        control={(
          <Switch
            checked={appStore.settings.allowTurnSteering}
            onChange={handleAllowTurnSteeringChange}
            sx={{ mt: -0.5 }}
          />
        )}
        label={(
          <Stack spacing={0.25}>
            <Typography variant="body1">
              {t("settings.allowTurnSteering")}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
              {t("settings.allowTurnSteeringDescription")}
            </Typography>
          </Stack>
        )}
      />
      <Stack spacing={1}>
        <FormControlLabel
          sx={{ alignItems: "flex-start", m: 0 }}
          control={(
            <Switch
              checked={appStore.settings.allowOutdatedCodex}
              onChange={handleAllowOutdatedCodexChange}
              sx={{ mt: -0.5 }}
            />
          )}
          label={(
            <Stack spacing={0.25}>
              <Typography variant="body1">
                {t("settings.allowOutdatedCodex")}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                {t("settings.allowOutdatedCodexDescription")}
              </Typography>
            </Stack>
          )}
        />
        {appStore.settings.allowOutdatedCodex ? (
          <Alert severity="warning" variant="outlined">
            {t("settings.allowOutdatedCodexWarning")}
          </Alert>
        ) : null}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
          <FormControlLabel
            sx={{ alignItems: "flex-start", m: 0 }}
            control={(
              <Switch
                checked={appStore.settings.developerMode}
                onChange={handleDeveloperModeChange}
                sx={{ mt: -0.5 }}
              />
            )}
            label={(
              <Stack spacing={0.25}>
                <Typography variant="body1">
                  {t("settings.developerMode")}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  {t("settings.developerModeDescription")}
                </Typography>
              </Stack>
            )}
          />
        </Box>
        {appStore.settings.developerMode ? (
          <Button
            type="button"
            variant="outlined"
            size="small"
            sx={{ flex: "0 0 auto", mt: 0.25 }}
            onClick={handleOpenDeveloperTools}
          >
            {t("settings.openDeveloperTools")}
          </Button>
        ) : null}
      </Stack>
      <Stack direction="row" spacing={1} sx={{ alignItems: "flex-start" }}>
        <Box sx={{ flex: "1 1 auto", minWidth: 0 }}>
          <FormControlLabel
            sx={{ alignItems: "flex-start", m: 0 }}
            control={(
              <Switch
                checked={appStore.settings.discordRichPresenceEnabled}
                onChange={handleDiscordRichPresenceChange}
                sx={{ mt: -0.5 }}
              />
            )}
            label={(
              <Stack spacing={0.25}>
                <Typography variant="body1">
                  {t("settings.discordRichPresence")}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontStyle: "italic" }}>
                  {t("settings.discordRichPresenceDescription")}
                </Typography>
              </Stack>
            )}
          />
        </Box>
        {appStore.settings.discordRichPresenceEnabled ? (
          <Button
            type="button"
            variant="outlined"
            size="small"
            sx={{ flex: "0 0 auto", mt: 0.25 }}
            onClick={handleDiscordReconnect}
          >
            {t("settings.discordReconnect")}
          </Button>
        ) : null}
      </Stack>
    </Stack>
  );
}

export const HomeSettingsViewX = observer(HomeSettingsView);
