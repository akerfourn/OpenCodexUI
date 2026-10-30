import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { Alert, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexUsageLimits } from "@open-codex-ui/opencodex-protocol";

import { isUsageResetProbablyUnavailable } from "../usage/usageResetEligibility";
import { UsageResetEligibilityDialog } from "./UsageResetEligibilityDialog";

interface UsageResetEligibilityNoticeProps {
  usage: OpenCodexUsageLimits | null;
  nothingToReset: boolean;
  onOpenHelp(href: string): void;
}

/** Warns about probable ineligibility while keeping the manual reset action available. */
export function UsageResetEligibilityNotice({
  usage,
  nothingToReset,
  onOpenHelp
}: UsageResetEligibilityNoticeProps) {
  const { t } = useTranslation();
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  /** Opens the detailed criteria without selecting or consuming a reset. */
  function handleOpenHelp(): void {
    setIsHelpOpen(true);
  }

  /** Returns to the reset list or confirmation step. */
  function handleCloseHelp(): void {
    setIsHelpOpen(false);
  }

  const informationButton = (
    <Tooltip title={t("sources.resetCredits.eligibilityTitle")} disableInteractive>
      <IconButton
        size="small"
        color="inherit"
        onClick={handleOpenHelp}
        aria-haspopup="dialog"
        aria-expanded={isHelpOpen}
        aria-label={t("sources.resetCredits.eligibilityTitle")}
      >
        <InfoOutlinedIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
  let notice = (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
      <Typography variant="body2" color="text.secondary">
        {t("sources.resetCredits.eligibilityTitle")}
      </Typography>
      {informationButton}
    </Stack>
  );

  if (nothingToReset || isUsageResetProbablyUnavailable(usage)) {
    let message = t("sources.resetCredits.eligibilityWarning");
    if (nothingToReset) {
      message = t("sources.resetCredits.nothingToReset");
    }
    notice = <Alert severity="warning" action={informationButton}>{message}</Alert>;
  }

  return (
    <>
      {notice}
      <UsageResetEligibilityDialog open={isHelpOpen} onClose={handleCloseHelp} onOpenHelp={onOpenHelp} />
    </>
  );
}

export const UsageResetEligibilityNoticeX = observer(UsageResetEligibilityNotice);
