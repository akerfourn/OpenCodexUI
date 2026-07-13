/**
 * Displays source-scoped banked rate-limit resets and confirms their consumption.
 */
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexUsageResetConsumeResult,
  OpenCodexUsageResetCredit,
  OpenCodexUsageResetCredits
} from "@open-codex-ui/opencodex-protocol";

import { UsageResetCreditsDetailsX } from "./UsageResetCreditsDetails";
import { UsageResetCreditConfirmation } from "./UsageResetCreditConfirmation";

type UsageResetCreditsDialogProps = {
  open: boolean;
  sourceName: string;
  summary: OpenCodexUsageResetCredits;
  isRefreshing: boolean;
  isConsuming: boolean;
  error: string | null;
  onClose(): void;
  onRefresh(): void;
  onConsume(creditId: string): Promise<OpenCodexUsageResetConsumeResult>;
};

/**
 * Displays reset details and the confirmation step required before consumption.
 *
 * @param props Dialog state and source-scoped actions.
 * @returns Rendered reset dialog.
 */
export function UsageResetCreditsDialog({
  open,
  sourceName,
  summary,
  isRefreshing,
  isConsuming,
  error,
  onClose,
  onRefresh,
  onConsume
}: UsageResetCreditsDialogProps) {
  const { i18n, t } = useTranslation();
  const [selectedCredit, setSelectedCredit] = useState<OpenCodexUsageResetCredit | null>(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  function handleClose(): void {
    if (isConsuming) {
      return;
    }

    setSelectedCredit(null);
    setIsConfirmed(false);
    onClose();
  }

  function handleRefresh(): void {
    setSelectedCredit(null);
    setIsConfirmed(false);
    onRefresh();
  }

  function handleSelectCredit(credit: OpenCodexUsageResetCredit): void {
    if (isConsuming) {
      return;
    }

    setSelectedCredit(credit);
    setIsConfirmed(false);
  }

  function handleBackToDetails(): void {
    if (isConsuming) {
      return;
    }

    setSelectedCredit(null);
    setIsConfirmed(false);
  }

  function handleConfirmationToggle(): void {
    setIsConfirmed((current) => !current);
  }

  async function handleConsume(): Promise<void> {
    if (selectedCredit === null || !isConfirmed || isConsuming) {
      return;
    }

    let result: OpenCodexUsageResetConsumeResult;

    try {
      result = await onConsume(selectedCredit.id);
    } catch {
      return;
    }

    if (result.outcome === "reset" || result.outcome === "alreadyRedeemed") {
      handleClose();
      return;
    }

    setSelectedCredit(null);
    setIsConfirmed(false);
  }

  const dialogContent = selectedCredit === null ? (
    <UsageResetCreditsDetailsX
      summary={summary}
      isConsuming={isConsuming}
      isRefreshing={isRefreshing}
      language={i18n.language}
      onRefresh={handleRefresh}
      onSelect={handleSelectCredit}
    />
  ) : (
    <UsageResetCreditConfirmation
      credit={selectedCredit}
      isConfirmed={isConfirmed}
      language={i18n.language}
      onToggle={handleConfirmationToggle}
    />
  );

  const dialogActions = selectedCredit === null ? (
    <Button type="button" onClick={handleClose} disabled={isConsuming}>
      {t("sources.cancel")}
    </Button>
  ) : (
    <>
      <Button type="button" onClick={handleBackToDetails} disabled={isConsuming}>
        {t("sources.resetCredits.back")}
      </Button>
      <Button
        type="button"
        variant="contained"
        disabled={!isConfirmed || isConsuming}
        onClick={() => void handleConsume()}
      >
        {isConsuming ? t("sources.resetCredits.applying") : t("sources.resetCredits.apply")}
      </Button>
    </>
  );

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={handleClose}>
      <DialogTitle>
        {selectedCredit === null
          ? t("sources.resetCredits.title", { source: sourceName })
          : t("sources.resetCredits.confirmTitle")}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error !== null ? <Alert severity="error">{error}</Alert> : null}
          {dialogContent}
        </Stack>
      </DialogContent>
      <DialogActions>{dialogActions}</DialogActions>
    </Dialog>
  );
}

export const UsageResetCreditsDialogX = observer(UsageResetCreditsDialog);
