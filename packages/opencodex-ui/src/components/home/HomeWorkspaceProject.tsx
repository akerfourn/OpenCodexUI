import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";
import type { HomeWorkspaceProjectStore } from "../../stores/app/HomeWorkspaceProjectStore";
import { HomeWorkspaceRowX } from "./HomeWorkspaceRow";

/** Groups folders by logical project, retaining cached projects with unavailable sources. */
export function HomeWorkspaceProject({ owner, root, onManage }: {
  owner: HomeWorkspaceProjectStore; root: RootStore; onManage(owner: HomeWorkspaceProjectStore): void;
}) {
  const { t } = useTranslation();
  const entries = root.homeWorkspacesStore.entriesFor(owner);
  const source = root.sourcesStore.findSource(owner.project.sourceId)?.name ?? t("workspaceHome.unavailableSource");
  const rows = entries.map(workspace => <HomeWorkspaceRowX key={workspace.id} owner={owner} workspace={workspace} />);
  const pending = owner.pendingCount === 0 ? null : <Alert severity="warning" sx={{ borderRadius: 0 }}>
    {t("workspaceHome.journals", { count: owner.pendingCount })}</Alert>;
  const error = owner.error === null ? null : <Alert severity="error">{owner.error}</Alert>;
  const offline = owner.isReadOnlyFromCache ? <Chip size="small" label={t("workspaceHome.offline")} /> : null;
  const progress = owner.isLoading ? <CircularProgress size={16} /> : null;
  const empty = entries.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ p: 1.5 }}>
    {t("workspaceManagement.empty")}</Typography> : null;

  /** Opening a project does not switch the workspace of an existing conversation. */
  function handleOpen(): void {
    const project = root.projectsStore.openProjectTab(owner.project, true);
    project.refreshThreads(owner.project.sourceId);
  }

  /** Reuses the existing source-aware management and confirmation flows. */
  function handleManage(): void {
    onManage(owner);
  }

  return <Box component="section" aria-label={owner.project.displayName ?? owner.project.defaultName}
    sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden", minWidth: 0 }}>
    <Stack direction="row" spacing={1} useFlexGap sx={{ px: 1.5, py: 1, alignItems: "center", flexWrap: "wrap" }}>
      <Stack sx={{ flex: 1, minWidth: 150 }}>
        <Typography variant="subtitle1" component="h3">{owner.project.displayName ?? owner.project.defaultName}</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>{source} · {owner.project.path}</Typography>
      </Stack>
      {offline}{progress}
      <Button size="small" onClick={handleOpen}>{t("workspaceHome.openProject")}</Button>
      <Button size="small" onClick={handleManage} disabled={owner.isLoading}>{t("workspaceHome.manage")}</Button>
    </Stack>
    {pending}{error}{rows}{empty}
  </Box>;
}

export const HomeWorkspaceProjectX = observer(HomeWorkspaceProject);
