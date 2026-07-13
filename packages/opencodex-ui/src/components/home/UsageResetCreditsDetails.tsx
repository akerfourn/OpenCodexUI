/**
 * Displays reset-credit details and the refresh fallback for incomplete data.
 */
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexUsageResetCredit,
  OpenCodexUsageResetCredits
} from "@open-codex-ui/opencodex-protocol";

import { formatUsageResetDate, formatUsageResetRelative } from "../usage/usageTimeFormat";

type UsageResetCreditsDetailsProps = {
  summary: OpenCodexUsageResetCredits;
  isConsuming: boolean;
  isRefreshing: boolean;
  language: string;
  onRefresh(): void;
  onSelect(credit: OpenCodexUsageResetCredit): void;
};

/**
 * Displays the list of reset details or explains why actions are unavailable.
 *
 * @param props Detail view state and actions.
 * @returns Rendered reset details.
 */
export function UsageResetCreditsDetails({
  summary,
  isConsuming,
  isRefreshing,
  language,
  onRefresh,
  onSelect
}: UsageResetCreditsDetailsProps) {
  const { t } = useTranslation();
  const credits = summary.credits ?? [];
  const hasCompleteDetails = summary.credits !== null
    && summary.credits.length === summary.availableCount;
  const hasUsableDetails = hasCompleteDetails
    && credits.length > 0
    && credits.every((credit) => credit.status === "available");

  if (!hasCompleteDetails) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning" icon={<WarningAmberOutlinedIcon />}>
          {t("sources.resetCredits.detailsUnavailable")}
        </Alert>
        <Button
          type="button"
          variant="outlined"
          startIcon={<RefreshOutlinedIcon />}
          disabled={isRefreshing || isConsuming}
          onClick={onRefresh}
        >
          {isRefreshing ? t("sources.resetCredits.refreshing") : t("sources.resetCredits.refresh")}
        </Button>
      </Stack>
    );
  }

  const detailsContent = credits.length === 0 ? (
    <Alert severity="warning">
      {t("sources.resetCredits.noDetailsAvailable")}
    </Alert>
  ) : (
    <Stack spacing={1.25}>
      {credits.map((credit) => {
        const expirationDate = formatUsageResetDate(credit.expiresAt, language);
        const expirationRelative = formatUsageResetRelative(credit.expiresAt, language);
        const expiration = expirationDate === null
          ? t("sources.resetCredits.noExpiration")
          : t("sources.resetCredits.expiresAt", {
              date: expirationDate,
              relative: expirationRelative === null ? "" : ` (${expirationRelative})`
            });
        const title = credit.title ?? t("sources.resetCredits.defaultTitle");

        return (
          <Paper
            key={credit.id}
            component="article"
            variant="outlined"
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              transition: "border-color 120ms ease, background-color 120ms ease",
              "&:hover": {
                borderColor: "primary.main",
                backgroundColor: "action.hover"
              }
            }}
          >
            <Stack spacing={1}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={1.25}
                sx={{
                  alignItems: { xs: "stretch", sm: "center" },
                  justifyContent: "space-between"
                }}
              >
                <Stack
                  direction="row"
                  spacing={1.25}
                  sx={{ alignItems: "flex-start", minWidth: 0 }}
                >
                  <Box
                    sx={{
                      alignItems: "center",
                      bgcolor: "action.hover",
                      borderRadius: 1,
                      color: "primary.main",
                      display: "flex",
                      flex: "0 0 auto",
                      height: 32,
                      justifyContent: "center",
                      width: 32
                    }}
                  >
                    <AutorenewOutlinedIcon fontSize="small" />
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle2">{title}</Typography>
                    {credit.description !== null ? (
                      <Typography variant="body2" color="text.secondary">
                        {credit.description}
                      </Typography>
                    ) : null}
                  </Box>
                </Stack>
                <Button
                  type="button"
                  size="small"
                  variant="contained"
                  disabled={!hasUsableDetails || isConsuming}
                  onClick={() => onSelect(credit)}
                  sx={{ alignSelf: { xs: "flex-start", sm: "auto" } }}
                >
                  {t("sources.resetCredits.apply")}
                </Button>
              </Stack>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                <AccessTimeOutlinedIcon sx={{ color: "text.secondary", fontSize: 17 }} />
                <Typography variant="caption" color="text.secondary">
                  {t("sources.resetCredits.expiration", { expiration })}
                </Typography>
              </Stack>
              {credit.status !== "available" ? (
                <Typography
                  variant="caption"
                  color="warning.main"
                  sx={{ fontWeight: 600 }}
                >
                  {t(`sources.resetCredits.status.${credit.status}`)}
                </Typography>
              ) : null}
            </Stack>
          </Paper>
        );
      })}
    </Stack>
  );

  return (
    <Stack spacing={2}>
      {!hasUsableDetails ? (
        <Alert severity="info">
          {t("sources.resetCredits.actionUnavailable")}
        </Alert>
      ) : null}
      {detailsContent}
      <Button
        type="button"
        variant="outlined"
        startIcon={<RefreshOutlinedIcon />}
        disabled={isRefreshing || isConsuming}
        onClick={onRefresh}
        sx={{ alignSelf: "flex-start" }}
      >
        {isRefreshing ? t("sources.resetCredits.refreshing") : t("sources.resetCredits.refresh")}
      </Button>
    </Stack>
  );
}

export const UsageResetCreditsDetailsX = observer(UsageResetCreditsDetails);
