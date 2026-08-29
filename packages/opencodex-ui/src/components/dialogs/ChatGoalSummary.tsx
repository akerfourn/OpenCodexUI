/** Displays the official usage counters returned with a native goal. */
import { Box, Chip, Divider, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexThreadGoal,
  OpenCodexThreadGoalStatus
} from "@open-codex-ui/opencodex-protocol";

type ChatGoalSummaryProps = {
  goal: OpenCodexThreadGoal;
  hasStarted: boolean;
};

/** Renders the status and counters of a native goal without exposing mutations. */
export function ChatGoalSummary({ goal, hasStarted }: ChatGoalSummaryProps) {
  const { t } = useTranslation();
  const statusLabel = getGoalStatusLabel(goal, hasStarted, t);
  const statusColor = getGoalStatusColor(goal.status);

  return (
    <Box sx={{ border: 1, borderColor: "divider", borderRadius: 1, p: 1.5 }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          <Typography variant="subtitle2">{t("goal.status")}</Typography>
          <Chip
            label={statusLabel}
            size="small"
            color={statusColor}
          />
        </Stack>
        <Divider />
        {renderChatGoalSummaryRow(
          t("goal.tokensUsed"),
          formatNumber(goal.tokensUsed)
        )}
        {renderChatGoalSummaryRow(t("goal.timeUsed"), `${formatNumber(goal.timeUsedSeconds)} s`)}
        {renderChatGoalSummaryRow(
          t("goal.tokenBudget"),
          goal.tokenBudget === null ? t("goal.serverDefault") : formatNumber(goal.tokenBudget)
        )}
      </Stack>
    </Box>
  );
}

/** Builds one aligned goal counter row. */
function renderChatGoalSummaryRow(label: string, value: string) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: "space-between" }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ textAlign: "right" }}>
        {value}
      </Typography>
    </Stack>
  );
}

/** Translates a status returned by Codex without guessing unknown values. */
function translateGoalStatus(
  status: OpenCodexThreadGoalStatus,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  switch (status) {
    case "active":
      return translate("goal.active");
    case "paused":
      return translate("goal.paused");
    case "blocked":
      return translate("goal.blocked");
    case "usageLimited":
      return translate("goal.usageLimited");
    case "budgetLimited":
      return translate("goal.budgetLimited");
    case "complete":
      return translate("goal.complete");
  }
}

/** Chooses the label that distinguishes a saved definition from a paused goal. */
function getGoalStatusLabel(
  goal: OpenCodexThreadGoal,
  hasStarted: boolean,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  if (goal.status === "paused" && !hasStarted) {
    return translate("goal.defined");
  }

  return translateGoalStatus(goal.status, translate);
}

/** Chooses a semantic color for the status chip. */
function getGoalStatusColor(
  status: OpenCodexThreadGoalStatus
): "default" | "primary" | "success" | "error" {
  if (status === "active") {
    return "primary";
  }

  if (status === "complete") {
    return "success";
  }

  if (status === "blocked" || status === "usageLimited" || status === "budgetLimited") {
    return "error";
  }

  return "default";
}

/** Formats a goal counter consistently across platforms. */
function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}
