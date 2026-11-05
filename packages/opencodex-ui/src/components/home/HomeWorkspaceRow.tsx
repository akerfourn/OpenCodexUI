import { Box, Chip, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import type { HomeWorkspaceProjectStore } from "../../stores/app/HomeWorkspaceProjectStore";
import { workspaceLabel } from "../../stores/project/threads/workspaceThreadGroups";
import { HomeWorkspaceSizeX } from "./HomeWorkspaceSize";

/** Declared progress stays distinct from conservative cleanup advice. */
export function HomeWorkspaceRow({ owner, workspace }: {
  owner: HomeWorkspaceProjectStore; workspace: OpenCodexProjectWorkspace;
}) {
  const { t, i18n } = useTranslation();
  const status = owner.statusFor(workspace);
  const activity = owner.activityFor(workspace);
  const error = owner.checkErrors.get(workspace.id);
  let activityLabel: string = t("workspaceManagement.unknown");
  const timestamp = Date.parse(activity?.lastActivityAt ?? "");
  if (Number.isFinite(timestamp)) activityLabel = new Intl.DateTimeFormat(i18n.resolvedLanguage,
    { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
  const progress = workspace.isPrimary ? null : <Chip size="small" variant="outlined"
    label={t(`workspaceWorkStatus.${workspace.workStatus ?? "active"}`)} />;
  const pending = owner.hasPending(workspace) ? <Chip size="small" color="warning"
    label={t("workspaceHome.pending")} /> : null;
  const count = activity === undefined ? null : <Typography variant="caption" color="text.secondary">
    {t("workspaceManagement.conversations", { count: activity.conversationCount })}</Typography>;
  const failure = error === undefined ? null : <Typography variant="caption" color="error" title={error}>
    {t("workspaceChanges.unavailable")}</Typography>;

  return <Box sx={{ display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap", py: 1, px: 1.5,
    borderTop: "1px solid", borderColor: "divider" }}>
    <Stack spacing={0.25} sx={{ flex: "2 1 220px", minWidth: 0 }}>
      <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
        <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>
          {workspaceLabel(workspace, t("workspaces.primary"))}</Typography>
        {progress}{pending}
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{workspace.path}</Typography>
      <Typography variant="caption" color="text.secondary">{t(`workspaceManagement.status.${status}`)}</Typography>
      {failure}
    </Stack>
    <Stack sx={{ flex: "1 1 160px" }}>
      <Typography variant="caption" color="text.secondary">{t("workspaceManagement.lastActivity", { date: activityLabel })}</Typography>
      {count}
    </Stack>
    <HomeWorkspaceSizeX owner={owner} workspace={workspace} />
  </Box>;
}

export const HomeWorkspaceRowX = observer(HomeWorkspaceRow);
