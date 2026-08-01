/**
 * Provides the dedicated usage history window content and its chart controls.
 */
import CalendarMonthOutlinedIcon from "@mui/icons-material/CalendarMonthOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import ShowChartOutlinedIcon from "@mui/icons-material/ShowChartOutlined";
import TimelineOutlinedIcon from "@mui/icons-material/TimelineOutlined";
import {
  Alert,
  Box,
  Button,
  Chip,
  CssBaseline,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Typography,
  useMediaQuery
} from "@mui/material";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexClientTransport,
  OpenCodexUsageHistory,
  OpenCodexUsageHistoryAggregation
} from "@open-codex-ui/opencodex-protocol";

import { createOpenCodexTheme } from "../../theme";
import {
  UsageHistoryChart
} from "./UsageHistoryChart";
import { HistoryChartCard, TokenCurveToggle } from "./UsageHistoryChartCard";
import {
  findRateSeries,
  formatDate,
  formatTokenCount,
  mapRateSeries,
  mapTokenSeries,
  readDateTime,
  readErrorMessage,
  readRateSeriesId,
  readRateSeriesLabel,
  toDateTimeInput,
  type TokenVisibility
} from "./usageHistoryViewHelpers";

type UsageHistoryWindowProps = {
  transport: OpenCodexClientTransport;
  initialSourceId: string;
};

type UsageHistoryPreset = "24h" | "7d" | "30d" | "custom";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Renders the standalone usage history window.
 *
 * @param props Transport and source selected from the main window.
 * @returns Usage history window.
 */
export function UsageHistoryWindow({ transport, initialSourceId }: UsageHistoryWindowProps) {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)", { noSsr: true });
  const theme = useMemo(() => createOpenCodexTheme(prefersDark ? "dark" : "light"), [prefersDark]);

  return (
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <UsageHistoryContent transport={transport} initialSourceId={initialSourceId} />
      </ThemeProvider>
    </StyledEngineProvider>
  );
}

/**
 * Loads and displays usage history for the selected source and range.
 *
 * @param props Transport and initial source.
 * @returns Usage history controls and charts.
 */
function UsageHistoryContent({ transport, initialSourceId }: UsageHistoryWindowProps) {
  const { i18n, t } = useTranslation();
  const now = useMemo(() => new Date(), []);
  const [sourceId, setSourceId] = useState(initialSourceId);
  const [sourceIds, setSourceIds] = useState<string[]>([initialSourceId]);
  const [sourceNames, setSourceNames] = useState<Record<string, string>>({
    [initialSourceId]: initialSourceId
  });
  const [from, setFrom] = useState(() => toDateTimeInput(new Date(now.getTime() - 7 * DAY_MS)));
  const [to, setTo] = useState(() => toDateTimeInput(now));
  const [preset, setPreset] = useState<UsageHistoryPreset>("7d");
  const [aggregation, setAggregation] = useState<OpenCodexUsageHistoryAggregation>("auto");
  const [history, setHistory] = useState<OpenCodexUsageHistory | null>(null);
  const [selectedRateSeriesId, setSelectedRateSeriesId] = useState<string>("");
  const [tokenVisibility, setTokenVisibility] = useState<TokenVisibility>({
    input: true,
    cachedInput: true,
    output: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    void transport.request<Array<{ id: string; name: string }>>({ type: "sources.list" })
      .then((sources) => {
        if (!isCurrent) {
          return;
        }

        const ids = sources.map((source) => source.id);
        setSourceIds(Array.from(new Set([initialSourceId, ...ids])));
        setSourceNames(Object.fromEntries(
          sources.map((source) => [source.id, source.name])
        ));
      })
      .catch(() => {
        // The initial source remains available even when diagnostics cannot be read.
      });

    return () => {
      isCurrent = false;
    };
  }, [initialSourceId, transport]);

  useEffect(() => {
    const fromDate = readDateTime(from);
    const toDate = readDateTime(to);

    if (sourceId.trim().length === 0 || fromDate === null || toDate === null) {
      setHistory(null);
      setErrorMessage(t("usagePage.historyInvalidRange"));
      return;
    }

    if (toDate <= fromDate) {
      setHistory(null);
      setErrorMessage(t("usagePage.historyInvalidRange"));
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setErrorMessage(null);
    void transport.request<OpenCodexUsageHistory>({
      type: "usage.history.read",
      sourceId,
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      aggregation
    })
      .then((result) => {
        if (isCurrent) {
          setHistory(result);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setHistory(null);
          setErrorMessage(readErrorMessage(error, t("usagePage.historyLoadError")));
        }
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [aggregation, from, refreshToken, sourceId, to, t, transport]);

  const selectedRateSeries = findRateSeries(history?.rateLimits ?? [], selectedRateSeriesId);
  const rateChartSeries = selectedRateSeries === null ? [] : [mapRateSeries(selectedRateSeries)];
  const instantTokenSeries = mapTokenSeries(history, "instant", tokenVisibility, t);
  const cumulativeTokenSeries = mapTokenSeries(history, "cumulative", tokenVisibility, t);

  useEffect(() => {
    const nextSeries = history?.rateLimits[0];

    if (history === null || nextSeries === undefined) {
      setSelectedRateSeriesId("");
      return;
    }

    const currentSeries = history.rateLimits.find(
      (series) => readRateSeriesId(series) === selectedRateSeriesId
    );

    if (currentSeries === undefined) {
      setSelectedRateSeriesId(readRateSeriesId(nextSeries));
    }
  }, [history, selectedRateSeriesId]);

  function handlePresetChange(nextPreset: UsageHistoryPreset): void {
    const nextTo = new Date();
    const duration = nextPreset === "24h"
      ? DAY_MS
      : nextPreset === "30d"
        ? 30 * DAY_MS
        : 7 * DAY_MS;

    if (nextPreset === "custom") {
      setPreset(nextPreset);
      return;
    }

    setPreset(nextPreset);
    setFrom(toDateTimeInput(new Date(nextTo.getTime() - duration)));
    setTo(toDateTimeInput(nextTo));
  }

  function handleTokenVisibilityChange(
    _event: React.MouseEvent<HTMLElement>,
    nextValues: string[]
  ): void {
    setTokenVisibility({
      input: nextValues.includes("input"),
      cachedInput: nextValues.includes("cachedInput"),
      output: nextValues.includes("output")
    });
  }

  return (
    <Box
      sx={{
        bgcolor: "background.default",
        height: "100%",
        minHeight: "100vh",
        overflowX: "hidden",
        overflowY: "auto",
        p: { xs: 2, md: 3 }
      }}
    >
      <Stack spacing={2.5} sx={{ margin: "0 auto", maxWidth: 1500 }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={2}
          sx={{ alignItems: { md: "center" }, justifyContent: "space-between" }}
        >
          <Box>
            <Typography variant="h4" component="h1">
              {t("usagePage.historyTitle")}
            </Typography>
            <Typography color="text.secondary" variant="body2">
              {t("usagePage.historyDescription")}
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<RefreshOutlinedIcon />}
            disabled={isLoading}
            onClick={() => setRefreshToken((value) => value + 1)}
          >
            {t("usagePage.refresh")}
          </Button>
        </Stack>

        <Paper variant="outlined" sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <FormControl fullWidth size="small">
                <InputLabel>{t("usagePage.historySource")}</InputLabel>
                <Select
                  value={sourceId}
                  label={t("usagePage.historySource")}
                  onChange={(event) => setSourceId(event.target.value)}
                >
                  {sourceIds.map((id) => (
                    <MenuItem key={id} value={id}>{sourceNames[id] ?? id}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl fullWidth size="small">
                <InputLabel>{t("usagePage.historyAggregation")}</InputLabel>
                <Select
                  value={aggregation}
                  label={t("usagePage.historyAggregation")}
                  onChange={(event) => setAggregation(event.target.value as OpenCodexUsageHistoryAggregation)}
                >
                  <MenuItem value="auto">{t("usagePage.historyAggregationAuto")}</MenuItem>
                  <MenuItem value="raw">{t("usagePage.historyAggregationRaw")}</MenuItem>
                  <MenuItem value="minute">{t("usagePage.historyAggregationMinute")}</MenuItem>
                  <MenuItem value="hour">{t("usagePage.historyAggregationHour")}</MenuItem>
                  <MenuItem value="day">{t("usagePage.historyAggregationDay")}</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ alignItems: { md: "center" } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <CalendarMonthOutlinedIcon color="action" fontSize="small" />
                <Button size="small" variant={preset === "24h" ? "contained" : "outlined"} onClick={() => handlePresetChange("24h")}>
                  {t("usagePage.historyPreset24h")}
                </Button>
                <Button size="small" variant={preset === "7d" ? "contained" : "outlined"} onClick={() => handlePresetChange("7d")}>
                  {t("usagePage.historyPreset7d")}
                </Button>
                <Button size="small" variant={preset === "30d" ? "contained" : "outlined"} onClick={() => handlePresetChange("30d")}>
                  {t("usagePage.historyPreset30d")}
                </Button>
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flex: "1 1 auto" }}>
                <DateTimeField label={t("usagePage.historyFrom")} value={from} onChange={(value) => { setPreset("custom"); setFrom(value); }} />
                <DateTimeField label={t("usagePage.historyTo")} value={to} onChange={(value) => { setPreset("custom"); setTo(value); }} />
              </Stack>
            </Stack>
            {history !== null ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Chip size="small" label={t("usagePage.historyResolvedAggregation", { aggregation: history.aggregation })} />
                <Chip size="small" label={t("usagePage.historyPoints", { count: history.tokens.length })} />
              </Stack>
            ) : null}
          </Stack>
        </Paper>

        {errorMessage !== null ? <Alert severity="error">{errorMessage}</Alert> : null}
        {history?.hasPartialTokenData === true ? (
          <Alert severity="warning">{t("usagePage.historyPartialData")}</Alert>
        ) : null}

        <HistoryChartCard
          title={t("usagePage.historyRateLimitChart")}
          icon={<ShowChartOutlinedIcon />}
          controls={(
            <FormControl size="small" sx={{ minWidth: { xs: "100%", sm: 260 } }}>
              <InputLabel>{t("usagePage.historyRateLimit")}</InputLabel>
              <Select
                value={selectedRateSeriesId}
                label={t("usagePage.historyRateLimit")}
                disabled={history === null || history.rateLimits.length === 0}
                onChange={(event) => setSelectedRateSeriesId(event.target.value)}
              >
                {(history?.rateLimits ?? []).map((series) => (
                  <MenuItem key={readRateSeriesId(series)} value={readRateSeriesId(series)}>
                    {readRateSeriesLabel(series)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        >
          <UsageHistoryChart
            series={rateChartSeries}
            emptyLabel={t("usagePage.historyNoData")}
            valueFormatter={(value) => `${Math.round(value)}%`}
            dateFormatter={(value) => formatDate(value, i18n.language)}
            ariaLabel={t("usagePage.historyRateLimitChart")}
            maxValue={100}
          />
        </HistoryChartCard>

        <HistoryChartCard
          title={t("usagePage.historyInstantTokens")}
          icon={<ShowChartOutlinedIcon />}
          controls={<TokenCurveToggle value={tokenVisibility} onChange={handleTokenVisibilityChange} t={t} />}
        >
          <UsageHistoryChart
            series={instantTokenSeries}
            emptyLabel={t("usagePage.historyNoData")}
            valueFormatter={formatTokenCount}
            dateFormatter={(value) => formatDate(value, i18n.language)}
            ariaLabel={t("usagePage.historyInstantTokens")}
          />
        </HistoryChartCard>

        <HistoryChartCard
          title={t("usagePage.historyCumulativeTokens")}
          icon={<TimelineOutlinedIcon />}
          controls={<TokenCurveToggle value={tokenVisibility} onChange={handleTokenVisibilityChange} t={t} />}
        >
          <UsageHistoryChart
            series={cumulativeTokenSeries}
            emptyLabel={t("usagePage.historyNoData")}
            valueFormatter={formatTokenCount}
            dateFormatter={(value) => formatDate(value, i18n.language)}
            ariaLabel={t("usagePage.historyCumulativeTokens")}
          />
        </HistoryChartCard>
      </Stack>
    </Box>
  );
}

type DateTimeFieldProps = {
  label: string;
  value: string;
  onChange(value: string): void;
};

/**
 * Renders one local date-time input used by the history range controls.
 *
 * @param props Input label and change callback.
 * @returns Date-time field.
 */
function DateTimeField({ label, value, onChange }: DateTimeFieldProps) {
  return (
    <Box sx={{ flex: "1 1 220px" }}>
      <Box sx={{ color: "text.secondary", fontSize: "0.75rem", mb: 0.25 }}>
        <label htmlFor={`history-${label}`}>{label}</label>
      </Box>
      <Box
        component="input"
        id={`history-${label}`}
        type="datetime-local"
        value={value}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        sx={{
          bgcolor: "background.paper",
          border: 1,
          borderColor: "divider",
          borderRadius: 1,
          color: "text.primary",
          font: "inherit",
          minHeight: 40,
          p: 1,
          width: "100%"
        }}
      />
    </Box>
  );
}

export const UsageHistoryWindowX = UsageHistoryWindow;
