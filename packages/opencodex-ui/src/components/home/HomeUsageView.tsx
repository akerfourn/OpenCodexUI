/**
 * Renders account usage limits seen from Codex.
 */
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import StarBorderOutlinedIcon from "@mui/icons-material/StarBorderOutlined";
import {
  Box,
  Button,
  Chip,
  LinearProgress,
  Paper,
  Stack,
  Tooltip,
  Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexUsageLimits,
  OpenCodexUsageWindow
} from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../../stores/RootStore";
import { readUsageLabel, readUsageLimitId } from "../../stores/UsageStore";
import { formatUsageReset } from "../usage/usageTimeFormat";

type HomeUsageViewProps = {
  store: RootStore;
};

/**
 * Renders the Home usage page.
 *
 * @param props Component props.
 *
 * @returns Rendered usage page.
 */
export function HomeUsageView({ store }: HomeUsageViewProps) {
  const { t } = useTranslation();
  const usageStore = store.usageStore;
  const defaultUsage = usageStore.defaultUsage;
  const otherUsages = usageStore.otherUsages;

  useEffect(() => {
    void usageStore.load();
  }, [usageStore]);

  function handleRefresh(): void {
    void usageStore.load();
  }

  let content = (
    <Typography color="text.secondary">
      {t("usagePage.empty")}
    </Typography>
  );

  if (defaultUsage !== null) {
    content = (
      <Stack spacing={2}>
        <UsageLimitCard
          usage={defaultUsage}
          tone="default"
          isDefault
          onSelectDefault={usageStore.selectDefaultUsageLimit}
        />
        {otherUsages.map((usage) => (
          <UsageLimitCard
            key={readUsageLimitId(usage)}
            usage={usage}
            tone="secondary"
            isDefault={false}
            onSelectDefault={usageStore.selectDefaultUsageLimit}
          />
        ))}
      </Stack>
    );
  }

  return (
    <Stack className="home-content-panel" spacing={2}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ alignItems: "center", justifyContent: "space-between" }}
      >
        <Box>
          <Typography variant="h4" component="h2">
            {t("usagePage.title")}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t("usagePage.description")}
          </Typography>
        </Box>
        <Tooltip title={t("usagePage.refresh")}>
          <span>
            <Button
              variant="contained"
              startIcon={<RefreshOutlinedIcon />}
              disabled={usageStore.isLoading}
              onClick={handleRefresh}
            >
              {t("usagePage.refresh")}
            </Button>
          </span>
        </Tooltip>
      </Stack>
      {content}
    </Stack>
  );
}

export const HomeUsageViewX = observer(HomeUsageView);

type UsageLimitCardProps = {
  usage: OpenCodexUsageLimits;
  tone: "default" | "secondary";
  isDefault: boolean;
  onSelectDefault(limitId: string): void;
};

function UsageLimitCard({
  usage,
  tone,
  isDefault,
  onSelectDefault
}: UsageLimitCardProps) {
  const { t } = useTranslation();
  const limitId = readUsageLimitId(usage);
  const windows = [usage.primary, usage.secondary].filter(
    (window): window is OpenCodexUsageWindow => window !== null
  );

  function handleSelectDefault(): void {
    onSelectDefault(limitId);
  }

  return (
    <Paper className={`usage-limit-card usage-limit-card-${tone}`} variant="outlined">
      <Stack spacing={1.25}>
        <Stack
          direction="row"
          spacing={1.5}
          sx={{ alignItems: "flex-start", justifyContent: "space-between" }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Typography variant="h6" component="h3" noWrap>
                {readUsageLabel(usage)}
              </Typography>
              {isDefault ? (
                <Chip
                  size="small"
                  color="primary"
                  icon={<CheckCircleOutlinedIcon />}
                  label={t("usagePage.default")}
                />
              ) : null}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              {limitId}
            </Typography>
          </Box>
          {!isDefault ? (
            <Tooltip title={t("usagePage.setDefault")}>
              <Button size="small" startIcon={<StarBorderOutlinedIcon />} onClick={handleSelectDefault}>
                {t("usagePage.setDefault")}
              </Button>
            </Tooltip>
          ) : null}
        </Stack>
        {usage.planType !== null ? (
          <Typography variant="body2" color="text.secondary">
            {t("usagePage.plan", { plan: usage.planType })}
          </Typography>
        ) : null}
        {windows.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            {t("usagePage.noWindow")}
          </Typography>
        ) : (
          <Stack spacing={1}>
            {windows.map((window, index) => (
              <UsageWindowRow
                key={`${window.label}:${index}`}
                window={window}
                tone={tone}
              />
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

type UsageWindowRowProps = {
  window: OpenCodexUsageWindow;
  tone: "default" | "secondary";
};

function UsageWindowRow({ window, tone }: UsageWindowRowProps) {
  const { i18n, t } = useTranslation();
  const label = t(`usage.labels.${window.label}`);
  const remainingPercent = Math.round(window.remainingPercent);
  const usedPercent = Math.round(window.usedPercent);

  return (
    <Tooltip title={t("usage.tooltip", {
      label,
      usedPercent,
      remainingPercent,
      reset: formatUsageReset(window.resetsAt, i18n.language)
    })}>
      <Box className="usage-limit-window-row">
        <Typography variant="body2" sx={{ minWidth: 72 }}>
          {label}
        </Typography>
        <LinearProgress
          variant="determinate"
          value={window.remainingPercent}
          color={tone === "default" ? "primary" : "secondary"}
          sx={{ flex: "1 1 auto", height: 10, borderRadius: 999 }}
        />
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 42, textAlign: "right" }}>
          {remainingPercent}%
        </Typography>
      </Box>
    </Tooltip>
  );
}
