import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Accordion, AccordionDetails, AccordionSummary, CircularProgress, Stack, Typography } from "@mui/material";
import ExpandMore from "@mui/icons-material/ExpandMore";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type { ProjectCommandsStore, ProjectCommandRunView } from "../../stores/project/ProjectCommandsStore";
import { commandSections } from "../../stores/project/projectCommandDefinitions";
import { ProjectCommandListX } from "./ProjectCommandList";

/** Promotes favorites once, followed by ungrouped commands and initially collapsed named groups. */
export function ProjectCommandSections({ commandsStore, onEdit, onOpenLogs }: {
  commandsStore: ProjectCommandsStore;
  onEdit(command: OpenCodexProjectCommand): void;
  onOpenLogs(run: ProjectCommandRunView): void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { favorites, ungrouped, groups } = commandSections(commandsStore.commands);
  const listProps = { commandsStore, onEdit, onOpenLogs };
  let favoritesContent = null;
  if (favorites.length > 0) favoritesContent = <>
    <Typography variant="caption" color="text.secondary">{t("commands.favorites")}</Typography>
    <ProjectCommandListX {...listProps} commands={favorites} />
  </>;
  let ungroupedLabel = null;
  if (ungrouped.length > 0 && (favorites.length > 0 || groups.length > 0)) {
    ungroupedLabel = <Typography variant="caption" color="text.secondary">{t("commands.ungrouped")}</Typography>;
  }
  const groupedContent = groups.map(group => {
    const isExpanded = expanded.has(group.name);
    const running = group.commands.some(command => commandsStore.hasRunningRuns(command.id));
    const activity = running ? <CircularProgress size={12} aria-label={t("commands.groupRunning")} /> : null;
    /** Retains expansion for this named group while it remains in the current panel. */
    function toggle(): void {
      setExpanded(current => {
        const next = new Set(current);
        if (next.has(group.name)) next.delete(group.name);
        else next.add(group.name);
        return next;
      });
    }
    return <Accordion key={group.name} expanded={isExpanded} onChange={toggle} disableGutters
      sx={{ minWidth: 0, boxShadow: "none", border: "1px solid", borderColor: "divider", "&:before": { display: "none" } }}>
      <AccordionSummary expandIcon={<ExpandMore />} sx={{ "& .MuiAccordionSummary-content": { minWidth: 0, alignItems: "center" } }}>
        <Typography noWrap title={group.name} sx={{ minWidth: 0, flex: 1 }}>{group.name}</Typography>
        <Typography variant="caption" sx={{ mx: 1 }}>{group.commands.length}</Typography>{activity}
      </AccordionSummary>
      <AccordionDetails sx={{ p: 0.5 }}>
        <Stack spacing={1}><ProjectCommandListX {...listProps} commands={group.commands} /></Stack>
      </AccordionDetails>
    </Accordion>;
  });
  return <>{favoritesContent}{ungroupedLabel}<ProjectCommandListX {...listProps} commands={ungrouped} />{groupedContent}</>;
}

export const ProjectCommandSectionsX = observer(ProjectCommandSections);
