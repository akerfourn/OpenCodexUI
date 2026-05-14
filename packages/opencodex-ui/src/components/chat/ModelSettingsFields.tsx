/**
 * Renders model and reasoning selectors shared by chat inputs.
 */
import { MenuItem, Stack, TextField } from "@mui/material";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexReasoningEffort } from "@open-codex-ui/opencodex-protocol";

type ModelSettingsFieldsProps = {
  selectedModel: string | null;
  reasoningEffort: OpenCodexReasoningEffort;
  modelOptions: string[];
  onModelChange(value: string | null): void;
  onReasoningEffortChange(value: OpenCodexReasoningEffort): void;
};

/**
 * Renders model and reasoning selectors.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ModelSettingsFields({
  selectedModel,
  reasoningEffort,
  modelOptions,
  onModelChange,
  onReasoningEffortChange
}: ModelSettingsFieldsProps) {
  const { t } = useTranslation();

  function handleModelChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    onModelChange(event.target.value.length > 0 ? event.target.value : null);
  }

  function handleEffortChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    onReasoningEffortChange(event.target.value as OpenCodexReasoningEffort);
  }

  return (
    <Stack direction="row" spacing={1}>
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
    </Stack>
  );
}
