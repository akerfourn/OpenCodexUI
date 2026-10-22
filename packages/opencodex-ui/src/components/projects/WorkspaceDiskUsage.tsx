import { observer } from "mobx-react-lite";
import { Alert, Button, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceDiskUsageStore } from "../../stores/project/WorkspaceDiskUsageStore";

/** Displays a dated estimate separately from the safe-removal workflow. */
export function WorkspaceDiskUsage({ workspace, store, disabled }: {
  workspace: OpenCodexProjectWorkspace; store: WorkspaceDiskUsageStore; disabled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const result = store.resultFor(workspace);
  const loading = store.loading.has(workspace.id);
  const error = store.errorFor(workspace);
  let details = <Typography variant="body2" color="text.secondary">{t("workspaceDiskUsage.unknown")}</Typography>;
  let warning = null;
  if (result !== undefined) {
    const formatter = new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 });
    let bytes = result.logicalBytes;
    let mode = t("workspaceDiskUsage.logical");
    if (result.allocatedBytes !== null) {
      bytes = result.allocatedBytes;
      mode = t("workspaceDiskUsage.allocated");
    }
    const size = formatWorkspaceBytes(bytes, formatter);
    const measuredAt = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" })
      .format(Date.parse(result.measuredAt));
    details = <Stack>
      <Typography variant="body2">{t("workspaceDiskUsage.size", { size, mode })}</Typography>
      <Typography variant="caption" color="text.secondary">{t("workspaceDiskUsage.measuredAt", { date: measuredAt })}</Typography>
    </Stack>;
    if (!result.complete) warning = <Alert severity="warning">{t("workspaceDiskUsage.partial")}</Alert>;
  }
  let buttonLabel = t("workspaceDiskUsage.measure");
  if (result !== undefined) buttonLabel = t("workspaceDiskUsage.refresh");
  if (loading) buttonLabel = t("workspaceDiskUsage.measuring");
  const failure = error === undefined ? null : <Alert severity="error">{error}</Alert>;

  /** Starts only the explicitly selected workspace; opening the inventory never scans files. */
  function handleMeasure(): void { void store.measure(workspace); }

  return <Stack spacing={1}>
    {details}{warning}{failure}
    <Button onClick={handleMeasure} disabled={disabled || !store.canMeasure(workspace)}>{buttonLabel}</Button>
  </Stack>;
}

/** Formats source byte counts with binary units and the user's numeric locale. */
function formatWorkspaceBytes(bytes: number, formatter: Intl.NumberFormat): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
  let index = 0;
  while (bytes >= 1024 && index < units.length - 1) { bytes /= 1024; index += 1; }
  return `${formatter.format(bytes)} ${units[index]}`;
}

export const WorkspaceDiskUsageX = observer(WorkspaceDiskUsage);
