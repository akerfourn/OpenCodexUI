import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Stack,
  Typography
} from "@mui/material";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { formatUsageResetRuleDate, readUsageResetHelpUrl } from "../usage/usageResetEligibility";

interface UsageResetEligibilityDialogProps {
  open: boolean;
  onClose(): void;
  onOpenHelp(href: string): void;
}

/** Explains manual reset criteria and links to the dated official guidance. */
export function UsageResetEligibilityDialog({
  open,
  onClose,
  onOpenHelp
}: UsageResetEligibilityDialogProps) {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const helpUrl = readUsageResetHelpUrl(language);

  /** Uses the application's link opener for the external help article. */
  function handleOpenHelp(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    onOpenHelp(helpUrl);
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="reset-eligibility-title">
      <DialogTitle id="reset-eligibility-title">{t("sources.resetCredits.eligibilityTitle")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography>{t("sources.resetCredits.eligibilityRule")}</Typography>
          <Typography variant="body2">{t("sources.resetCredits.eligibilityCoverage")}</Typography>
          <Typography variant="body2">{t("sources.resetCredits.eligibilityRetained")}</Typography>
          <Typography variant="body2" color="text.secondary">
            {t("sources.resetCredits.eligibilityEstimate")}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {t("sources.resetCredits.eligibilityCheckedAt", { date: formatUsageResetRuleDate(language) })}
          </Typography>
          <Link href={helpUrl} onClick={handleOpenHelp}>
            {t("sources.resetCredits.eligibilityHelp")}
          </Link>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("sources.resetCredits.closeHelp")}</Button>
      </DialogActions>
    </Dialog>
  );
}
