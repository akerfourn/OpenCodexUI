import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceActivity } from "@open-codex-ui/opencodex-protocol";
import type { WorkspaceManagementStatus } from "../../stores/project/workspaceManagement";
import { workspaceLabel } from "../../stores/project/threads/workspaceThreadGroups";

/** Shows one source-owned checkout and keeps inspection separate from confirmed deletion. */
export function WorkspaceManagementRow({ workspace, activity, status, disabled, onProperties, onRemove }: {
  workspace: OpenCodexProjectWorkspace; activity?: OpenCodexWorkspaceActivity; status: WorkspaceManagementStatus;
  disabled: boolean; onProperties(workspace: OpenCodexProjectWorkspace): void;
  onRemove(workspace: OpenCodexProjectWorkspace): void;
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
  const canInspect = status === "candidate" || status === "recent" || status === "activityUnknown";
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
      <Typography variant="body2" color="text.secondary">
        {t("workspaceManagement.lastActivity", { date: lastActivity })}</Typography>
      {count}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Button disabled={disabled} onClick={handleProperties}>{t("workspaces.properties")}</Button>{inspect}
      </Box>
    </Stack>
  </Paper>;
}
export const WorkspaceManagementRowX = observer(WorkspaceManagementRow);
