import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceActivity, OpenCodexWorkspaceWorkStatus } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceManagementStatus } from "../../stores/project/workspaceManagement";
import { workspaceLabel } from "../../stores/project/threads/workspaceThreadGroups";
import { WorkspaceWorkStatusControlX } from "./WorkspaceWorkStatusControl";
import { WorkspaceDiskUsageX } from "./WorkspaceDiskUsage";
import { WorkspaceChangesSummaryX } from "./WorkspaceChangesSummary";
import type { OpenCodexWorkspaceChanges } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceDiskUsageStore } from "../../stores/project/WorkspaceDiskUsageStore";

/** Shows one source-owned checkout and keeps inspection separate from confirmed deletion. */
export function WorkspaceManagementRow({ workspace, activity, changes, changesError, status, disabled, workStatusDisabled, onWorkStatus, onProperties, onRemove, diskUsage }: {
  workspace: OpenCodexProjectWorkspace; activity?: OpenCodexWorkspaceActivity; status: WorkspaceManagementStatus;
  disabled: boolean; onProperties(workspace: OpenCodexProjectWorkspace): void;
  changes?: OpenCodexWorkspaceChanges; changesError?: string;
  onRemove(workspace: OpenCodexProjectWorkspace): void;
  workStatusDisabled: boolean;
  diskUsage: WorkspaceDiskUsageStore;
  onWorkStatus(workspace: OpenCodexProjectWorkspace, status: OpenCodexWorkspaceWorkStatus): void;
}) {
  const { t, i18n } = useTranslation();
  const name = workspaceLabel(workspace, t("workspaces.primary"));
  const timestamp = Date.parse(activity?.lastActivityAt ?? "");
  let lastActivity: string = t("workspaceManagement.unknown");
  if (Number.isFinite(timestamp)) lastActivity = new Intl.DateTimeFormat(i18n.resolvedLanguage, {
    dateStyle: "medium", timeStyle: "short"
  }).format(timestamp);
  const count = activity === undefined ? null : <Typography variant="caption" color="text.secondary">
    {t("workspaceManagement.conversations", { count: activity.conversationCount })}</Typography>;
  const canInspect = status === "candidate" || status === "recent" || status === "activityUnknown"
    || status === "inProgress" || status === "retained" || status === "changesUnknown" || status === "modified";
  const inspect = canInspect ? <Button color="error" disabled={disabled} onClick={handleRemove}>
    {t("workspaceManagement.inspectRemoval")}</Button> : null;
  /** Opens metadata without changing the currently selected workspace. */
  function handleProperties(): void { onProperties(workspace); }
  /** Opens the existing confirmation; this button itself never removes files. */
  function handleRemove(): void { onRemove(workspace); }

  return <Paper variant="outlined" sx={{ p: 2 }}>
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="subtitle2" sx={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{name}</Typography>
        <Chip size="small" label={t(`workspaceManagement.status.${status}`)} />
      </Stack>
      <Typography variant="body2" sx={{ overflowWrap: "anywhere" }}>{workspace.path}</Typography>
      <WorkspaceWorkStatusControlX workspace={workspace} disabled={workStatusDisabled} onChange={onWorkStatus} />
      <Typography variant="body2" color="text.secondary">
        {t("workspaceManagement.lastActivity", { date: lastActivity })}</Typography>
      {count}
      <WorkspaceChangesSummaryX changes={changes} error={changesError} />
      <WorkspaceDiskUsageX workspace={workspace} store={diskUsage} disabled={disabled} />
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button disabled={disabled} onClick={handleProperties}>{t("workspaces.properties")}</Button>{inspect}
      </Box>
    </Stack>
  </Paper>;
}
export const WorkspaceManagementRowX = observer(WorkspaceManagementRow);
