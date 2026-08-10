/**
 * Displays cached token usage statistics for one project.
 */
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Typography
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexProjectStatistics } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";

type ProjectStatisticsDialogProps = {
  open: boolean;
  projectPath: string;
  sourceId: string | null;
  store: RootStore;
  onClose(): void;
};

type TokenStatisticCardProps = {
  label: string;
  value: string;
};

/**
 * Displays project-level cached token usage.
 *
 * @param props Dialog state and project identity.
 * @returns Rendered statistics dialog.
 */
export function ProjectStatisticsDialog({
  open,
  projectPath,
  sourceId,
  store,
  onClose
}: ProjectStatisticsDialogProps) {
  const { t } = useTranslation();
  const [statistics, setStatistics] = useState<OpenCodexProjectStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    let isCancelled = false;
    setStatistics(null);
    setHasError(false);
    setIsLoading(true);

    void store.request<OpenCodexProjectStatistics>({
      type: "projects.statistics.read",
      projectPath,
      sourceId
    }).then((result) => {
      if (isCancelled) {
        return;
      }

      setStatistics(result);
    }).catch(() => {
      if (!isCancelled) {
        setHasError(true);
      }
    }).finally(() => {
      if (!isCancelled) {
        setIsLoading(false);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [open, projectPath, sourceId, store]);

  const dialogContent = buildDialogContent(statistics, isLoading, hasError, t);

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <BarChartOutlinedIcon color="primary" />
          <span>{t("projectStatistics.title")}</span>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>{dialogContent}</DialogContent>
      <DialogActions>
        <Button type="button" onClick={onClose}>
          {t("projectStatistics.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Builds the dialog body for the current loading or statistics state.
 *
 * @param statistics Loaded project statistics, or `null`.
 * @param isLoading Whether the request is in progress.
 * @param hasError Whether the request failed.
 * @param translate Translation function.
 * @returns Dialog content.
 */
function buildDialogContent(
  statistics: OpenCodexProjectStatistics | null,
  isLoading: boolean,
  hasError: boolean,
  translate: (key: string, options?: Record<string, unknown>) => string
) {
  if (isLoading) {
    return (
      <Stack spacing={1.5} sx={{ alignItems: "center", py: 4 }}>
        <CircularProgress size={28} />
        <Typography color="text.secondary">
          {translate("projectStatistics.loading")}
        </Typography>
      </Stack>
    );
  }

  if (hasError || statistics === null) {
    return <Alert severity="error">{translate("projectStatistics.loadError")}</Alert>;
  }

  const hasKnownUsage = statistics.chatsWithTokenUsage > 0;
  const totalTokenValue = hasKnownUsage
    ? formatTokenCount(statistics.tokenUsage.totalTokens)
    : "—";
  const tokenCards: TokenStatisticCardProps[] = [
    {
      label: translate("projectStatistics.inputTokens"),
      value: formatOptionalTokenCount(statistics.tokenUsage.inputTokens, hasKnownUsage)
    },
    {
      label: translate("projectStatistics.cachedInputTokens"),
      value: formatOptionalTokenCount(statistics.tokenUsage.cachedInputTokens, hasKnownUsage)
    },
    {
      label: translate("projectStatistics.outputTokens"),
      value: formatOptionalTokenCount(statistics.tokenUsage.outputTokens, hasKnownUsage)
    },
    {
      label: translate("projectStatistics.reasoningTokens"),
      value: formatOptionalTokenCount(statistics.tokenUsage.reasoningOutputTokens, hasKnownUsage)
    }
  ];

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        {translate("projectStatistics.description")}
      </Typography>
      <Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
        <Typography variant="overline" color="text.secondary">
          {translate("projectStatistics.totalTokens")}
        </Typography>
        <Typography variant="h3" component="p">
          {totalTokenValue}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {translate("projectStatistics.coverage", {
            known: statistics.chatsWithTokenUsage,
            count: statistics.chatCount
          })}
        </Typography>
      </Paper>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 1
        }}
      >
        {tokenCards.map((card) => (
          <TokenStatisticCard key={card.label} label={card.label} value={card.value} />
        ))}
      </Box>
      {statistics.chatsWithoutTokenUsage > 0 ? (
        <Alert severity="info">
          {translate("projectStatistics.unknownChats", {
            count: statistics.chatsWithoutTokenUsage
          })}
        </Alert>
      ) : null}
      {statistics.chatCount === 0 ? (
        <Typography color="text.secondary">
          {translate("projectStatistics.empty")}
        </Typography>
      ) : null}
    </Stack>
  );
}

/**
 * Renders one token usage metric card.
 *
 * @param props Metric label and formatted value.
 * @returns Rendered metric card.
 */
function TokenStatisticCard({ label, value }: TokenStatisticCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="caption" color="text.secondary" noWrap>
        {label}
      </Typography>
      <Typography variant="h6" component="p">
        {value}
      </Typography>
    </Paper>
  );
}

/**
 * Formats a token counter with the active locale.
 *
 * @param value Token count.
 * @returns Formatted token count.
 */
function formatTokenCount(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

/**
 * Formats a token counter only when at least one chat has known usage.
 *
 * @param value Token count.
 * @param hasKnownUsage Whether the aggregate contains known usage.
 * @returns Formatted token count or an unavailable marker.
 */
function formatOptionalTokenCount(value: number, hasKnownUsage: boolean): string {
  return hasKnownUsage ? formatTokenCount(value) : "—";
}

export const ProjectStatisticsDialogX = ProjectStatisticsDialog;
