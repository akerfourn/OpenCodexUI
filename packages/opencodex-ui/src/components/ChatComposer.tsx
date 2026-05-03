import { useEffect, useState } from "react";
import { Button, MenuItem, Stack, TextField } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexReasoningEffort } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";

type ChatComposerProps = {
  store: RootStore;
  currentThreadId: string | null;
  selectedModel: string | null;
  reasoningEffort: OpenCodexReasoningEffort;
  modelOptions: string[];
  isWorking: boolean;
};

export function ChatComposer({
  store,
  currentThreadId,
  selectedModel,
  reasoningEffort,
  modelOptions,
  isWorking
}: ChatComposerProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setDraft("");
  }, [currentThreadId]);

  function handleInput(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setDraft(event.target.value);
  }

  function submitDraft(): void {
    if (draft.trim().length === 0 || isWorking) {
      return;
    }

    store.sendMessage(draft);
    setDraft("");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitDraft();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!event.ctrlKey || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitDraft();
  }

  function handleModelChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setSelectedModel(event.target.value.length > 0 ? event.target.value : null);
  }

  function handleEffortChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.setReasoningEffort(event.target.value as OpenCodexReasoningEffort);
  }

  function handleInterrupt(): void {
    store.interruptTurn();
  }

  return (
    <form className="composer" onSubmit={handleSubmit}>
      <TextField
        value={draft}
        placeholder={t("composer.messagePlaceholder")}
        multiline
        minRows={4}
        fullWidth
        sx={{ maxWidth: 820, justifySelf: "center" }}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
      />
      <Stack className="composer-controls" direction="row" spacing={1}>
        <TextField
          select
          size="small"
        value={selectedModel ?? ""}
          label={t("composer.model")}
          onChange={handleModelChange}
          sx={{ maxWidth: 220, minWidth: 160 }}
        >
          {modelOptions.map((model) => (
            <MenuItem value={model} key={model}>
              {model}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={reasoningEffort}
          label={t("composer.reasoning")}
          onChange={handleEffortChange}
          sx={{ maxWidth: 160, minWidth: 130 }}
        >
          <MenuItem value="low">low</MenuItem>
          <MenuItem value="medium">medium</MenuItem>
          <MenuItem value="high">high</MenuItem>
          <MenuItem value="xhigh">xhigh</MenuItem>
        </TextField>
        <div className="spacer" />
        {isWorking ? (
          <Button type="button" variant="outlined" onClick={handleInterrupt}>
            {t("composer.interrupt")}
          </Button>
        ) : null}
        <Button variant="contained" type="submit" disabled={isWorking}>
          {t("composer.send")}
        </Button>
      </Stack>
    </form>
  );
}
