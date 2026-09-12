/** Renders one editable application log policy row. */
import {
  MenuItem,
  Stack,
  TextField,
  Typography
} from "@mui/material";
import type { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexLogPolicy } from "@open-codex-ui/opencodex-protocol";

import {
  type LogPolicyCategory,
  type LogPolicyDraftErrors,
  type LogPolicyDraftPolicy
} from "./homeLogPolicyDraft";

type HomeLogPolicyRowProps = {
  category: LogPolicyCategory;
  policy: LogPolicyDraftPolicy;
  errors: LogPolicyDraftErrors[LogPolicyCategory];
  isSaving: boolean;
  onModeChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void;
  onNumberChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void;
};

type PolicyField = "maxEntries" | "retentionDays";

const POLICY_MODES: OpenCodexLogPolicy["mode"][] = [
  "disabled",
  "session",
  "retained",
  "unlimited"
];

/** Renders one category label, mode selector, and applicable numeric limit. */
export function HomeLogPolicyRow({
  category,
  policy,
  errors,
  isSaving,
  onModeChange,
  onNumberChange
}: HomeLogPolicyRowProps) {
  const { t } = useTranslation();
  const numberField: PolicyField = policy.mode === "session" ? "maxEntries" : "retentionDays";
  const numberFieldLimit = numberField === "maxEntries" ? 10_000 : 3_650;
  const hasNumberField = policy.mode === "session" || policy.mode === "retained";
  const numberError = errors?.[numberField];
  const numberHelperText = numberError === "invalid"
    ? t("logs.policyInvalidNumber", { min: 1, max: numberFieldLimit })
    : undefined;
  const numberFieldContent = hasNumberField ? (
    <TextField
      fullWidth
      label={t(`logs.${numberField}`)}
      name={`${category}.${numberField}`}
      type="number"
      value={policy[numberField]}
      onChange={onNumberChange}
      error={numberError !== undefined}
      helperText={numberHelperText}
      slotProps={{
        htmlInput: { min: 1, max: numberFieldLimit, step: 1 }
      }}
      disabled={isSaving}
    />
  ) : null;
  const modeOptions = POLICY_MODES.map((mode) => (
    <MenuItem key={mode} value={mode}>
      {t(`logs.policyModes.${mode}`)}
    </MenuItem>
  ));

  return (
    <Stack spacing={1}>
      <Typography variant="subtitle1">
        {t(`logs.policyCategories.${category}`)}
      </Typography>
      <TextField
        select
        fullWidth
        label={t("logs.policyMode")}
        name={category}
        value={policy.mode}
        onChange={onModeChange}
        disabled={isSaving}
      >
        {modeOptions}
      </TextField>
      {numberFieldContent}
    </Stack>
  );
}
