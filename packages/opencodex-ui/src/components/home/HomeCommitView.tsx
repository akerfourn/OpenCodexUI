/**
 * Renders commit message generation settings.
 */
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import type { ChangeEvent } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexCommitMessageLanguage,
  OpenCodexReasoningEffort
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";

type HomeCommitViewProps = {
  store: RootStore;
};

const defaultModelValue = "__default__";
const defaultReasoningValue = "__default__";
const reasoningEfforts: OpenCodexReasoningEffort[] = ["low", "medium", "high", "xhigh"];

/**
 * Renders the Home commit configuration page.
 *
 * @param props Component props.
 * @returns Rendered commit settings.
 */
export function HomeCommitView({ store }: HomeCommitViewProps) {
  const { t } = useTranslation();
  const promptStore = store.commitPromptStore;
  const appStore = store.appStore;
  const modelValue = appStore.settings.commitMessageModel ?? defaultModelValue;
  const reasoningValue = appStore.settings.commitMessageReasoningEffort ?? defaultReasoningValue;

  useEffect(() => {
    void promptStore.load();
  }, [promptStore]);

  function handlePromptChange(event: ChangeEvent<HTMLInputElement>): void {
    promptStore.setPrompt(event.target.value);
  }

  function handleSave(): void {
    void promptStore.save();
  }

  function handleReset(): void {
    void promptStore.reset();
  }

  function handleModelChange(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    appStore.setCommitMessageModel(value === defaultModelValue ? null : value);
  }

  function handleLanguageChange(event: ChangeEvent<HTMLInputElement>): void {
    appStore.setCommitMessageLanguage(event.target.value as OpenCodexCommitMessageLanguage);
  }

  function handleReasoningChange(event: ChangeEvent<HTMLInputElement>): void {
    const value = event.target.value;
    appStore.setCommitMessageReasoningEffort(
      value === defaultReasoningValue ? null : value as OpenCodexReasoningEffort
    );
  }

  const errorContent = promptStore.errorMessage === null ? null : (
    <Alert severity="error">{promptStore.errorMessage}</Alert>
  );
  const statusText = promptStore.isDefault
    ? t("commitPrompt.usingDefault")
    : t("commitPrompt.usingCustom");

  return (
    <section className="home-section">
      <Stack spacing={2}>
        <Box
          sx={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            bgcolor: "background.default",
            pb: 1
          }}
        >
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="h5" component="h2">
                {t("commitPrompt.title")}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t("commitPrompt.description")}
              </Typography>
            </Box>

            {errorContent}

            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={1}
              sx={{ alignItems: { xs: "stretch", md: "center" } }}
            >
              <TextField
                select
                size="small"
                label={t("commitPrompt.model")}
                value={modelValue}
                sx={{ minWidth: 200 }}
                onChange={handleModelChange}
              >
                <MenuItem value={defaultModelValue}>{t("commitPrompt.defaultModel")}</MenuItem>
                {appStore.commitMessageModelOptions.map((model) => (
                  <MenuItem key={model} value={model}>
                    {model}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                size="small"
                label={t("commitPrompt.reasoning")}
                value={reasoningValue}
                sx={{ minWidth: 160 }}
                onChange={handleReasoningChange}
              >
                <MenuItem value={defaultReasoningValue}>{t("commitPrompt.defaultReasoning")}</MenuItem>
                {reasoningEfforts.map((effort) => (
                  <MenuItem key={effort} value={effort}>
                    {effort}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                size="small"
                label={t("commitPrompt.outputLanguage")}
                value={appStore.settings.commitMessageLanguage}
                sx={{ minWidth: 150 }}
                onChange={handleLanguageChange}
              >
                <MenuItem value="en">{t("commitPrompt.languages.en")}</MenuItem>
                <MenuItem value="fr">{t("commitPrompt.languages.fr")}</MenuItem>
              </TextField>

              <Box sx={{ flex: "1 1 auto" }} />

              <Button
                variant="outlined"
                size="small"
                disabled={promptStore.isLoading || promptStore.isSaving}
                onClick={handleReset}
              >
                {t("commitPrompt.reset")}
              </Button>
              <Button
                variant="contained"
                size="small"
                disabled={
                  promptStore.isLoading ||
                  promptStore.isSaving ||
                  promptStore.prompt.trim().length === 0
                }
                onClick={handleSave}
              >
                {promptStore.isSaving ? t("commitPrompt.saving") : t("commitPrompt.save")}
              </Button>
            </Stack>
          </Stack>
        </Box>

        <TextField
          label={t("commitPrompt.prompt")}
          value={promptStore.prompt}
          minRows={18}
          multiline
          fullWidth
          disabled={promptStore.isLoading}
          helperText={statusText}
          onChange={handlePromptChange}
        />
      </Stack>
    </section>
  );
}

export const HomeCommitViewX = observer(HomeCommitView);
