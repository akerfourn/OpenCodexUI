import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, Checkbox, Chip,
  CircularProgress, FormControlLabel, MenuItem, Stack, TextField, Typography
} from "@mui/material";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";
import type { HomeWorkspaceProjectStore } from "../../stores/app/HomeWorkspaceProjectStore";
import type { HomeWorkspaceFilter } from "../../stores/app/HomeWorkspacesStore";
import { WorkspaceManagementDialogX } from "../projects/WorkspaceManagementDialog";
import { WorkspaceStorageSettingsX } from "./WorkspaceStorageSettings";
import { HomeWorkspaceProjectX } from "./HomeWorkspaceProject";

/** Home loads cache on entry; source scans and disk measurements require explicit actions. */
export function HomeWorkspacesView({ store }: { store: RootStore }) {
  const { t } = useTranslation();
  const inventory = store.homeWorkspacesStore;
  const [managed, setManaged] = useState<HomeWorkspaceProjectStore | null>(null);
  useEffect(() => {
    void inventory.load();
    return () => inventory.dispose();
  }, [inventory]);
  const owners = inventory.visibleProjects.filter(owner => inventory.entriesFor(owner).length > 0
    || owner.pendingCount > 0 || owner.error !== null || owner.isLoading);
  const count = owners.reduce((total, owner) => total + inventory.entriesFor(owner).length, 0);
  const projects = owners.map(owner => <HomeWorkspaceProjectX key={owner.project.id} owner={owner} root={store} onManage={handleManage} />);
  const sources = store.sourcesStore.sources.map(source => <MenuItem key={source.id} value={source.id}>{source.name}</MenuItem>);
  const filters: HomeWorkspaceFilter[] = ["all", "active", "completed", "candidate", "pending"];
  const filterChoices = filters.map(filter => <MenuItem key={filter} value={filter}>{t(`workspaceHome.filters.${filter}`)}</MenuItem>);
  const progress = inventory.isLoading ? <CircularProgress size={20} aria-label={t("workspaceHome.loading")} /> : null;
  const error = inventory.error === null ? null : <Alert severity="error">{inventory.error}</Alert>;
  const empty = owners.length === 0 && !inventory.isLoading ? <Typography color="text.secondary">
    {t("workspaceManagement.empty")}</Typography> : null;
  const managedProject = managed === null ? undefined : store.projectsStore.projectStoresById.get(managed.project.id);
  const management = managedProject === undefined ? null : <WorkspaceManagementDialogX project={managedProject} onClose={handleCloseManagement} />;

  /** Refreshes cache and performs bounded Git/file checks, leaving disk size measurement separate. */
  function handleRefresh(): void {
    void inventory.load(true);
  }

  /** Management may open a background project tab while Home remains selected. */
  function handleManage(owner: HomeWorkspaceProjectStore): void {
    store.projectsStore.openProjectTab(owner.project, false);
    setManaged(owner);
  }

  /** Reflects confirmed changes without rescanning every other project. */
  function handleCloseManagement(): void {
    const owner = managed;
    setManaged(null);
    if (owner !== null) void owner.load(true);
  }

  return <Stack className="home-content-panel" spacing={2}>
    <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
      <Typography variant="h5" component="h2" sx={{ flex: 1 }}>{t("home.workspaces")}</Typography>
      <Chip size="small" label={t("workspaceHome.projects", { count: owners.length })} />
      <Chip size="small" label={t("workspaceHome.count", { count })} />
      {progress}<Button onClick={handleRefresh} disabled={inventory.isLoading}>{t("workspaceManagement.refresh")}</Button>
    </Stack>
    <Typography variant="body2" color="text.secondary">{t("workspaceHome.description")}</Typography>
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
      <TextField size="small" label={t("workspaceHome.search")} value={inventory.search}
        onChange={event => inventory.setSearch(event.target.value)} sx={{ flex: "1 1 220px" }} />
      <TextField select size="small" label={t("workspaceHome.source")} value={inventory.sourceId}
        onChange={event => inventory.setSourceId(event.target.value)} sx={{ minWidth: 160 }}>
        <MenuItem value="">{t("home.allSources")}</MenuItem>{sources}
      </TextField>
      <TextField select size="small" label={t("workspaceHome.filter")} value={inventory.filter}
        onChange={event => inventory.setFilter(event.target.value as HomeWorkspaceFilter)} sx={{ minWidth: 160 }}>
        {filterChoices}
      </TextField>
    </Stack>
    <FormControlLabel control={<Checkbox checked={inventory.showHidden}
      onChange={event => inventory.setShowHidden(event.target.checked)} />} label={t("workspaceHome.showHidden")} />
    {error}{projects}{empty}{management}
    <Accordion disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreOutlinedIcon />}>{t("workspaceHome.storageSettings")}</AccordionSummary>
      <AccordionDetails><WorkspaceStorageSettingsX store={store} /></AccordionDetails>
    </Accordion>
  </Stack>;
}

export const HomeWorkspacesViewX = observer(HomeWorkspacesView);
