import { useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { Box, CircularProgress, IconButton, Tooltip, Typography } from "@mui/material";
import GppGoodOutlinedIcon from "@mui/icons-material/GppGoodOutlined";
import GppBadOutlinedIcon from "@mui/icons-material/GppBadOutlined";
import GppMaybeOutlinedIcon from "@mui/icons-material/GppMaybeOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { useTranslation } from "react-i18next";
import type { OpenCodexAutoApprovalReview } from "@open-codex-ui/opencodex-protocol";

import { AutoApprovalReviewDetailsDialogX } from "./AutoApprovalReviewDetailsDialog";

/** Shows one automatic review snapshot in the reasoning timeline. */
export function AutoApprovalReviewRow({ review }: { review: OpenCodexAutoApprovalReview }) {
  const { t } = useTranslation();
  const [isDetailsOpen, setDetailsOpen] = useState(false);
  const label = t(`message.autoApprovalReview.status.${review.status}`);
  let summary: string = label;
  if (review.action.length > 0) {
    summary = `${label} — ${review.action}`;
  }
  let icon: ReactNode = <GppMaybeOutlinedIcon fontSize="small" color="warning" />;
  let color = "warning.main";
  if (review.status === "inProgress") {
    icon = <CircularProgress size={18} aria-label={label} />;
    color = "text.secondary";
  } else if (review.status === "approved") {
    icon = <GppGoodOutlinedIcon fontSize="small" color="success" />;
    color = "success.main";
  } else if (review.status === "denied") {
    icon = <GppBadOutlinedIcon fontSize="small" color="error" />;
    color = "error.main";
  }

  /** Opens the terminal decision without issuing another approval request. */
  function handleOpenDetails(): void {
    setDetailsOpen(true);
  }

  /** Closes only the details dialog. */
  function handleCloseDetails(): void {
    setDetailsOpen(false);
  }

  let detailsButton: ReactNode = null;
  if (review.status !== "inProgress") {
    detailsButton = (
      <Tooltip title={t("message.autoApprovalReview.details")}>
        <IconButton
          size="small"
          aria-label={t("message.autoApprovalReview.details")}
          onClick={handleOpenDetails}
          sx={{ flex: "0 0 auto", width: 24, height: 24, p: 0.25 }}
        >
          <InfoOutlinedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, width: "100%" }}>
        <Box component="span" sx={{ display: "inline-flex", flex: "0 0 auto" }}>{icon}</Box>
        <Typography variant="body2" noWrap sx={{ color, flex: "1 1 auto", minWidth: 0 }}>
          {summary}
        </Typography>
        {detailsButton}
      </Box>
      <AutoApprovalReviewDetailsDialogX
        open={isDetailsOpen}
        review={review}
        onClose={handleCloseDetails}
      />
    </>
  );
}

export const AutoApprovalReviewRowX = observer(AutoApprovalReviewRow);
