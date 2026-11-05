import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { HomeWorkspaceProjectStore } from "../../stores/app/HomeWorkspaceProjectStore";
import { formatWorkspaceBytes } from "../projects/WorkspaceDiskUsage";

/** Compact dated measurements never turn an unmeasured folder into a zero-byte estimate. */
export function HomeWorkspaceSize({ owner, workspace }: {
  owner: HomeWorkspaceProjectStore; workspace: OpenCodexProjectWorkspace;
}) {
  const { t, i18n } = useTranslation();
  const result = owner.sizeFor(workspace);
  const store = owner.diskUsage;
  const loading = store.loading.has(workspace.id);
  const error = store.errorFor(workspace);
  let label: string = t("workspaceHome.sizeUnknown");
  let detail = null;
  if (result !== undefined) {
    label = formatWorkspaceBytes(result.allocatedBytes ?? result.logicalBytes,
      new Intl.NumberFormat(i18n.resolvedLanguage, { maximumFractionDigits: 1 }));
    const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "short", timeStyle: "short" })
      .format(Date.parse(result.measuredAt));
    let dateLabel = date;
    if (!result.complete) dateLabel = t("workspaceHome.partialSize", { date });
    detail = <Typography variant="caption" color="text.secondary">{dateLabel}</Typography>;
  }
  const icon = loading ? <CircularProgress size={16} /> : <RefreshOutlinedIcon fontSize="small" />;
  const failure = error === undefined ? null : <Typography variant="caption" color="error" title={error}>
    {t("workspaceHome.measureFailed")}</Typography>;

  /** Only this button starts a bounded source-side traversal. */
  function handleMeasure(): void {
    void store.measure(workspace);
  }

  return <Stack sx={{ minWidth: 150 }}>
    <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
      <Tooltip title={t("workspaceDiskUsage.help")} disableInteractive>
        <Typography variant="body2">{label}</Typography>
      </Tooltip>
      <Tooltip title={t("workspaceDiskUsage.measure")} disableInteractive>
        <span><IconButton size="small" aria-label={t("workspaceDiskUsage.measure")}
          disabled={owner.isLoading || !store.canMeasure(workspace)} onClick={handleMeasure}>{icon}</IconButton></span>
      </Tooltip>
    </Stack>
    {detail}{failure}
  </Stack>;
}

export const HomeWorkspaceSizeX = observer(HomeWorkspaceSize);
