/**
 * Groups usage charts with their controls and token-curve toggles.
 */
import {
  Paper,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from "@mui/material";
import type { MouseEvent, ReactNode } from "react";

import type { TokenVisibility } from "./usageHistoryViewHelpers";

type HistoryChartCardProps = {
  title: string;
  icon: ReactNode;
  controls: ReactNode;
  children: ReactNode;
};

type TokenCurveToggleProps = {
  value: TokenVisibility;
  onChange(event: MouseEvent<HTMLElement>, values: string[]): void;
  t: (key: string) => string;
};

/**
 * Renders one chart panel with a title and optional controls.
 *
 * @param props Card content.
 * @returns Chart card.
 */
export function HistoryChartCard({ title, icon, controls, children }: HistoryChartCardProps) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, md: 2 } }}>
      <Stack spacing={1}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={1.5}
          sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}
        >
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {icon}
            <Typography variant="h6" component="h2">{title}</Typography>
          </Stack>
          {controls}
        </Stack>
        {children}
      </Stack>
    </Paper>
  );
}

/**
 * Renders the shared token curve visibility control.
 *
 * @param props Current visibility and translation callback.
 * @returns Curve toggle group.
 */
export function TokenCurveToggle({ value, onChange, t }: TokenCurveToggleProps) {
  const values = [
    value.input ? "input" : null,
    value.cachedInput ? "cachedInput" : null,
    value.output ? "output" : null
  ].filter((entry): entry is string => entry !== null);

  return (
    <ToggleButtonGroup
      size="small"
      value={values}
      onChange={onChange}
      aria-label={t("usagePage.historyCurves")}
    >
      <ToggleButton value="input" aria-label={t("usagePage.historyInputTokens")}>
        {t("usagePage.historyInputShort")}
      </ToggleButton>
      <ToggleButton value="cachedInput" aria-label={t("usagePage.historyCachedInputTokens")}>
        {t("usagePage.historyCachedShort")}
      </ToggleButton>
      <ToggleButton value="output" aria-label={t("usagePage.historyOutputTokens")}>
        {t("usagePage.historyOutputShort")}
      </ToggleButton>
    </ToggleButtonGroup>
  );
}
