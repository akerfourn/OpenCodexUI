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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexCommitMessageLanguage,
  OpenCodexReasoningEffort
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";
import { MarkdownMessageM } from "../messages/MarkdownMessage";

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
  const commitPromptLabelsKey = appStore.settings.versioningVocabulary === "technical"
    ? "commitPrompt.technical"
    : "commitPrompt.simple";
  const modelValue = appStore.settings.commitMessageModel ?? defaultModelValue;
  const reasoningValue = appStore.settings.commitMessageReasoningEffort ?? defaultReasoningValue;
  const [isEditingPrompt, setEditingPrompt] = useState(false);

  useEffect(() => {
    void promptStore.load();
  }, [promptStore]);

  function handlePromptChange(event: ChangeEvent<HTMLInputElement>): void {
    promptStore.setPrompt(event.target.value);
  }

  async function handleSave(): Promise<void> {
    await promptStore.save();

    if (promptStore.errorMessage === null) {
      setEditingPrompt(false);
    }
  }

  async function handleReset(): Promise<void> {
    await promptStore.reset();

    if (promptStore.errorMessage === null) {
      setEditingPrompt(false);
    }
  }

  function handleEdit(): void {
    setEditingPrompt(true);
  }

  function handleCancel(): void {
    promptStore.restoreSavedPrompt();
    setEditingPrompt(false);
  }

  function handleOpenLink(href: string): void {
    store.openExternalLink(href);
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
  const actionContent = isEditingPrompt ? (
    <>
      <Button
        variant="outlined"
        size="small"
        disabled={promptStore.isLoading || promptStore.isSaving}
        onClick={handleReset}
      >
        {t("commitPrompt.reset")}
      </Button>
      <Button
        variant="text"
        size="small"
        disabled={promptStore.isSaving}
        onClick={handleCancel}
      >
        {t("commitPrompt.cancel")}
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
    </>
  ) : (
    <Button
      variant="contained"
      size="small"
      disabled={promptStore.isLoading}
      onClick={handleEdit}
    >
      {t("commitPrompt.edit")}
    </Button>
  );
  const promptContent = isEditingPrompt ? (
    <TextField
      label={t("commitPrompt.prompt")}
      value={promptStore.prompt}
      minRows={18}
      multiline
      fullWidth
      disabled={promptStore.isLoading}
      onChange={handlePromptChange}
    />
  ) : (
    <Box>
      <Box
        sx={{
          minHeight: 420,
          p: 2,
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          bgcolor: "background.paper"
        }}
      >
        <MarkdownMessageM markdown={promptStore.prompt} onOpenLink={handleOpenLink} />
      </Box>
    </Box>
  );

  return (
    <section className="home-section">
      <Stack spacing={2}>
        <Box
          sx={{
            position: "sticky",
            top: "-24px",
            zIndex: 2,
            bgcolor: "background.default",
            mt: "-24px",
            mx: "-24px",
            px: "24px",
            pt: "24px",
            pb: 1.5
          }}
        >
          <Stack spacing={1.5}>
            <Box>
              <Typography variant="h5" component="h2">
                {t(`${commitPromptLabelsKey}.title`)}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t(`${commitPromptLabelsKey}.description`)}
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
              {actionContent}
            </Stack>
          </Stack>
        </Box>

        {promptContent}
      </Stack>
    </section>
  );
}

export const HomeCommitViewX = observer(HomeCommitView);
