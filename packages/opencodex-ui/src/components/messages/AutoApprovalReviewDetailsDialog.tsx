import { observer } from "mobx-react-lite";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexAutoApprovalReview } from "@open-codex-ui/opencodex-protocol";

import { CommandDetailBlock } from "./CommandDetailBlock";
import { CommandMetadataRow } from "./CommandMetadataRow";

interface AutoApprovalReviewDetailsDialogProps {
  open: boolean;
  review: OpenCodexAutoApprovalReview;
  /** Closes the informational dialog without changing the review decision. */
  onClose(): void;
}

/** Displays Codex's explanation as plain text, with the reviewed action and risk assessment. */
export function AutoApprovalReviewDetailsDialog({ open, review, onClose }: AutoApprovalReviewDetailsDialogProps) {
  const { t } = useTranslation();
  if (!open) {
    return null;
  }

  return (
    <Dialog open fullWidth maxWidth="md" onClose={onClose} aria-labelledby="auto-review-details-title">
      <DialogTitle id="auto-review-details-title">{t("message.autoApprovalReview.details")}</DialogTitle>
      <DialogContent dividers sx={{ maxHeight: "75vh", overflow: "auto" }}>
        <Stack spacing={2}>
          <Typography sx={{ fontWeight: 600 }}>
            {t(`message.autoApprovalReview.status.${review.status}`)}
          </Typography>
          <CommandDetailBlock
            label={t("message.autoApprovalReview.rationale")}
            value={review.rationale ?? ""}
            emptyLabel={t("message.autoApprovalReview.noRationale")}
          />
          <CommandDetailBlock
            label={t("message.autoApprovalReview.action")}
            value={review.actionDetails}
            emptyLabel={t("message.autoApprovalReview.noAction")}
          />
          <Box sx={{ display: "grid", gap: 0.5, gridTemplateColumns: "max-content minmax(0, 1fr)" }}>
            <CommandMetadataRow label={t("message.autoApprovalReview.risk")} value={review.riskLevel} />
            <CommandMetadataRow
              label={t("message.autoApprovalReview.authorization")}
              value={review.userAuthorization}
            />
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions><Button onClick={onClose}>{t("message.close")}</Button></DialogActions>
    </Dialog>
  );
}

export const AutoApprovalReviewDetailsDialogX = observer(AutoApprovalReviewDetailsDialog);
