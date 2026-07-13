/**
 * Renders the irreversible reset-credit confirmation step.
 */
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Alert,
  Checkbox,
  FormControlLabel,
  Stack,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexUsageResetCredit } from "@open-codex-ui/opencodex-protocol";

import { formatUsageResetDate } from "../usage/usageTimeFormat";

type UsageResetCreditConfirmationProps = {
  credit: OpenCodexUsageResetCredit;
  isConfirmed: boolean;
  language: string;
  onToggle(): void;
};

/**
 * Displays the selected reset and its required confirmation checkbox.
 *
 * @param props Selected reset and confirmation state.
 * @returns Rendered confirmation content.
 */
export function UsageResetCreditConfirmation({
  credit,
  isConfirmed,
  language,
  onToggle
}: UsageResetCreditConfirmationProps) {
  const { t } = useTranslation();
  const title = credit.title ?? t("sources.resetCredits.defaultTitle");
  const expirationDate = formatUsageResetDate(credit.expiresAt, language);

  return (
    <Stack spacing={2}>
      <Typography variant="body1">{title}</Typography>
      {credit.description !== null ? (
        <Typography variant="body2" color="text.secondary">
          {credit.description}
        </Typography>
      ) : null}
      {expirationDate !== null ? (
        <Typography variant="body2" color="text.secondary">
          {t("sources.resetCredits.expiration", { expiration: expirationDate })}
        </Typography>
      ) : null}
      <Alert severity="warning" icon={<WarningAmberOutlinedIcon />}>
        {t("sources.resetCredits.confirmWarning")}
      </Alert>
      <FormControlLabel
        control={<Checkbox checked={isConfirmed} onChange={onToggle} />}
        label={t("sources.resetCredits.confirmCheckbox")}
      />
    </Stack>
  );
}
