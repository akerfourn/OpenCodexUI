/**
 * Renders model and reasoning selectors shared by chat inputs.
 */
import { MenuItem, Stack, TextField } from "@mui/material";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexModelServiceTier,
  OpenCodexReasoningEffort,
  OpenCodexServiceTier
} from "@open-codex-ui/opencodex-protocol";

type ModelSettingsFieldsProps = {
  selectedModel: string | null;
  reasoningEffort: OpenCodexReasoningEffort;
  selectedServiceTier: OpenCodexServiceTier | null;
  modelOptions: string[];
  serviceTierOptions: OpenCodexModelServiceTier[];
  onModelChange(value: string | null): void;
  onReasoningEffortChange(value: OpenCodexReasoningEffort): void;
  onServiceTierChange(value: OpenCodexServiceTier | null): void;
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
  selectedServiceTier,
  modelOptions,
  serviceTierOptions,
  onModelChange,
  onReasoningEffortChange,
  onServiceTierChange
}: ModelSettingsFieldsProps) {
  const { t } = useTranslation();

  function handleModelChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    onModelChange(event.target.value.length > 0 ? event.target.value : null);
  }

  function handleEffortChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    onReasoningEffortChange(event.target.value as OpenCodexReasoningEffort);
  }

  function handleServiceTierChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ): void {
    onServiceTierChange(event.target.value.length > 0 ? event.target.value : null);
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
      <TextField
        select
        size="small"
        value={selectedServiceTier ?? ""}
        label={t("composer.serviceTier")}
        onChange={handleServiceTierChange}
        disabled={serviceTierOptions.length === 0}
        sx={{ maxWidth: 160, minWidth: 130 }}
      >
        <MenuItem value="">{t("composer.serviceTierDefault")}</MenuItem>
        {serviceTierOptions.map((tier) => (
          <MenuItem value={tier.id} key={tier.id}>
            {tier.name.length > 0 ? tier.name : tier.id}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
