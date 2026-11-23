import AddCommentOutlinedIcon from "@mui/icons-material/AddCommentOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import { Box, Button, IconButton, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";
import { ThreadButtonX } from "../threads/ThreadButton";
import type { OpenSubAgentDialog } from "../threads/subAgentDialog";

/** Lists personal chats from every source without grouping them into projects or workspaces. */
export function DiscussionsSidebar({ store, onOpenSubAgentDialog }: {
  store: RootStore; onOpenSubAgentDialog: OpenSubAgentDialog;
}) {
  const { t } = useTranslation();
  const discussions = store.discussionsStore;
  const sourceId = discussions.sourceId;
  const sources = store.sourcesStore.sources;
  const canCreate = sourceId !== null && store.sourcesStore.isSourceReady(sourceId);
  const loading = discussions.isLoading ? <LinearProgress /> : null;
  const empty = discussions.entries.length === 0 && !discussions.isLoading
    ? <Typography color="text.secondary" variant="body2" sx={{ p: 2 }}>{t("discussions.noConversations")}</Typography> : null;
  const sourceOptions = sources.map((source) => <MenuItem key={source.id} value={source.id}>{source.name}</MenuItem>);
  const archiveLabel = discussions.archived ? t("discussions.showActive") : t("discussions.showArchived");

  /** Refreshes cache metadata; native changes also arrive through the normal source synchronization. */
  function handleRefresh(): void { void discussions.load(); }
  /** Switches between the active and archived catalogues. */
  function handleArchive(): void { discussions.setArchived(!discussions.archived); }
  /** Chooses the source for future drafts without mutating any existing conversation. */
  function handleSource(event: React.ChangeEvent<HTMLInputElement>): void { discussions.setSource(event.target.value); }
  /** Filters by conversation title and preview locally. */
  function handleSearch(event: React.ChangeEvent<HTMLInputElement>): void { discussions.setSearch(event.target.value); }

  return (
    <Stack component="aside" sx={{ height: "100%", minHeight: 0 }}>
      <Stack direction="row" sx={{ alignItems: "center", p: 1, gap: 0.5 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>{t("discussions.title")}</Typography>
        <Tooltip title={archiveLabel}><IconButton size="small" aria-label={archiveLabel}
          aria-pressed={discussions.archived} color={discussions.archived ? "primary" : "default"} onClick={handleArchive}>
          <ArchiveOutlinedIcon fontSize="small" />
        </IconButton></Tooltip>
        <Tooltip title={t("header.refresh")}><span><IconButton size="small" aria-label={t("header.refresh")}
          disabled={discussions.isLoading} onClick={handleRefresh}><RefreshOutlinedIcon fontSize="small" /></IconButton></span></Tooltip>
      </Stack>
      <Stack sx={{ px: 1, pb: 1, gap: 1 }}>
        <TextField select size="small" label={t("discussions.newSource")} value={sourceId ?? ""}
          disabled={sources.length === 0} onChange={handleSource}>{sourceOptions}</TextField>
        <Button variant="outlined" startIcon={<AddCommentOutlinedIcon />} disabled={!canCreate} onClick={discussions.createDraft}>
          {t("discussions.newConversation")}
        </Button>
        <TextField size="small" label={t("discussions.search")} value={discussions.search} onChange={handleSearch} />
      </Stack>
      {loading}
      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", px: 1 }}>
        {discussions.entries.map(({ environment, thread }) => (
          <ThreadButtonX key={`${environment.project.id}:${thread.id}`} projectStore={environment} root={store}
            thread={thread} onOpenSubAgentDialog={onOpenSubAgentDialog} />
        ))}
        {empty}
      </Box>
    </Stack>
  );
}

export const DiscussionsSidebarX = observer(DiscussionsSidebar);
