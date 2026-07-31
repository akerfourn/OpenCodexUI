/**
 * Displays execution metadata and token usage for one Codex turn.
 */
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexThreadTokenUsage,
  OpenCodexTurnExecutionMetadata
} from "@open-codex-ui/opencodex-protocol";

type TurnDetailsDialogProps = {
  open: boolean;
  execution?: OpenCodexTurnExecutionMetadata | null;
  tokenUsage?: OpenCodexThreadTokenUsage | null;
  onClose(): void;
};

type DetailRowProps = {
  label: string;
  value: string;
};

/**
 * Renders execution and consumption details for one turn.
 *
 * @param props Dialog properties.
 * @returns Rendered dialog.
 */
export function TurnDetailsDialog({
  open,
  execution,
  tokenUsage,
  onClose
}: TurnDetailsDialogProps) {
  const { t } = useTranslation();
  const executionRows = execution === undefined || execution === null
    ? []
    : createExecutionRows(execution, t);
  const tokenRows = tokenUsage === undefined || tokenUsage === null
    ? []
    : createTokenRows(tokenUsage, t);
  const hasTokenUsage = tokenUsage !== undefined && tokenUsage !== null;

  return (
    <Dialog open={open} fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{t("turnDetails.title")}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          {executionRows.length > 0 ? (
            <DetailSection title={t("turnDetails.execution")} rows={executionRows} />
          ) : null}
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
              {t("turnDetails.tokens")}
            </Typography>
            {hasTokenUsage ? (
              <Stack divider={<Divider flexItem />}>
                {tokenRows.map(([label, value]) => (
                  <DetailRow key={label} label={label} value={value} />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {t("turnDetails.tokensUnavailable")}
              </Typography>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("turnDetails.close")}</Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Renders a titled group of detail rows.
 *
 * @param props Section properties.
 * @returns Rendered section.
 */
function DetailSection({
  title,
  rows
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
        {title}
      </Typography>
      <Stack divider={<Divider flexItem />}>
        {rows.map(([label, value]) => (
          <DetailRow key={label} label={label} value={value} />
        ))}
      </Stack>
    </Box>
  );
}

/**
 * Renders one aligned label/value row.
 *
 * @param props Row properties.
 * @returns Rendered row.
 */
function DetailRow({ label, value }: DetailRowProps) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ alignItems: "baseline", justifyContent: "space-between", py: 0.65 }}
    >
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{ minWidth: 0, overflowWrap: "anywhere", textAlign: "right" }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

/**
 * Creates localized execution metadata rows.
 *
 * @param execution Turn execution metadata.
 * @param translate Translation function.
 * @returns Label/value rows.
 */
function createExecutionRows(
  execution: OpenCodexTurnExecutionMetadata,
  translate: ReturnType<typeof useTranslation>["t"]
): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const effectiveModel = execution.effectiveModel ?? execution.requestedModel;
  const effectiveReasoning = execution.effectiveReasoningEffort ?? execution.requestedReasoningEffort;

  if (effectiveModel !== null) {
    rows.push([translate("turnDetails.model"), effectiveModel]);
  }

  if (
    execution.requestedModel !== null &&
    execution.requestedModel !== effectiveModel
  ) {
    rows.push([translate("turnDetails.requestedModel"), execution.requestedModel]);
  }

  if (effectiveReasoning !== null) {
    rows.push([
      translate("turnDetails.reasoning"),
      translate(`reasoningEffort.${effectiveReasoning}`, { defaultValue: effectiveReasoning })
    ]);
  }

  if (
    execution.requestedReasoningEffort !== null &&
    execution.requestedReasoningEffort !== effectiveReasoning
  ) {
    rows.push([
      translate("turnDetails.requestedReasoning"),
      translate(`reasoningEffort.${execution.requestedReasoningEffort}`, {
        defaultValue: execution.requestedReasoningEffort
      })
    ]);
  }

  rows.push([
    translate("turnDetails.speed"),
    formatServiceTier(execution.serviceTier, translate)
  ]);

  return rows;
}

/**
 * Creates localized token usage rows for the current turn.
 *
 * @param usage Thread usage snapshot containing the turn's latest breakdown.
 * @param translate Translation function.
 * @returns Label/value rows.
 */
function createTokenRows(
  usage: OpenCodexThreadTokenUsage,
  translate: ReturnType<typeof useTranslation>["t"]
): Array<[string, string]> {
  return [
    [translate("turnDetails.totalTokens"), formatTokenCount(usage.last.totalTokens)],
    [translate("turnDetails.inputTokens"), formatTokenCount(usage.last.inputTokens)],
    [translate("turnDetails.cachedInputTokens"), formatTokenCount(usage.last.cachedInputTokens)],
    [translate("turnDetails.outputTokens"), formatTokenCount(usage.last.outputTokens)],
    [translate("turnDetails.reasoningTokens"), formatTokenCount(usage.last.reasoningOutputTokens)]
  ];
}

/**
 * Formats a service tier identifier for display.
 *
 * @param serviceTier Service tier identifier, or `null` for the default.
 * @param translate Translation function.
 * @returns Display label.
 */
function formatServiceTier(
  serviceTier: string | null,
  translate: ReturnType<typeof useTranslation>["t"]
): string {
  if (serviceTier === null || serviceTier.trim().length === 0) {
    return translate("turnDetails.speedAuto");
  }

  if (serviceTier.toLowerCase() === "fast") {
    return translate("turnDetails.speedFast");
  }

  return serviceTier;
}

/**
 * Formats a token count with the browser's current number formatting.
 *
 * @param value Token count.
 * @returns Formatted count.
 */
function formatTokenCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}
