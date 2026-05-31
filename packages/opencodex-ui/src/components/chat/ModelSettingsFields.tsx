/**
 * Renders model and reasoning selectors shared by chat inputs.
 */
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import MemoryOutlinedIcon from "@mui/icons-material/MemoryOutlined";
import PsychologyOutlinedIcon from "@mui/icons-material/PsychologyOutlined";
import { Stack } from "@mui/material";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexModelServiceTier,
  OpenCodexReasoningEffort,
  OpenCodexServiceTier
} from "@open-codex-ui/opencodex-protocol";

import { SettingMenuButton } from "./SettingMenuButton";

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
  const modelValue = selectedModel ?? "";
  const modelOptionsWithCurrent = ensureOption(modelOptions, modelValue);
  const serviceTierValue = selectedServiceTier ?? "";
  const serviceTierEntries = serviceTierOptions.map((tier) => ({
    value: tier.id,
    label: tier.name.length > 0 ? tier.name : tier.id,
    description: tier.description
  }));

  return (
    <Stack direction="row" spacing={0.75} sx={{ minWidth: 0, flexWrap: "wrap" }}>
      <SettingMenuButton
        icon={<MemoryOutlinedIcon fontSize="small" />}
        label={t("composer.model")}
        value={modelValue}
        options={modelOptionsWithCurrent.map((model) => ({ value: model, label: model }))}
        onChange={(value) => {
          onModelChange(value.length > 0 ? value : null);
        }}
      />
      <SettingMenuButton
        icon={<PsychologyOutlinedIcon fontSize="small" />}
        label={t("composer.reasoning")}
        value={reasoningEffort}
        options={[
          { value: "low", label: "low" },
          { value: "medium", label: "medium" },
          { value: "high", label: "high" },
          { value: "xhigh", label: "xhigh" }
        ]}
        onChange={onReasoningEffortChange}
      />
      <SettingMenuButton
        icon={<BoltOutlinedIcon fontSize="small" />}
        label={t("composer.serviceTier")}
        disabled={serviceTierOptions.length === 0}
        value={serviceTierValue}
        options={[
          { value: "", label: t("composer.serviceTierDefault") },
          ...serviceTierEntries
        ]}
        onChange={(value) => {
          onServiceTierChange(value.length > 0 ? value : null);
        }}
      />
    </Stack>
  );
}


function ensureOption(options: string[], value: string): string[] {
  if (value.length === 0 || options.includes(value)) {
    return options;
  }

  return [value, ...options];
}
