import { useState } from "react";
import { observer } from "mobx-react-lite";
import { Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type { ProjectCommandsStore, ProjectCommandRunView } from "../../stores/project/ProjectCommandsStore";
import { commandSections } from "../../stores/project/projectCommandDefinitions";
import { ProjectCommandListX } from "./ProjectCommandList";
import { ProjectCommandGroupX } from "./ProjectCommandGroup";

/** Promotes favorites once, followed by ungrouped commands and initially collapsed named groups. */
export function ProjectCommandSections({ commandsStore, onCreate, onEdit, onOpenLogs }: {
  commandsStore: ProjectCommandsStore;
  onCreate(groupName: string): void;
  onEdit(command: OpenCodexProjectCommand): void;
  onOpenLogs(run: ProjectCommandRunView): void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { favorites, ungrouped, groups } = commandSections(commandsStore.commands, commandsStore.groups.names);
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
    /** Retains expansion for this named group while it remains in the current panel. */
    function toggle(): void {
      setExpanded(current => {
        const next = new Set(current);
        if (next.has(group.name)) next.delete(group.name);
        else next.add(group.name);
        return next;
      });
    }
    return <ProjectCommandGroupX key={group.name} name={group.name} commands={group.commands} store={commandsStore}
      expanded={isExpanded} onToggle={toggle} onCreate={onCreate} onEdit={onEdit} onOpenLogs={onOpenLogs} />;
  });
  return <>{favoritesContent}{ungroupedLabel}<ProjectCommandListX {...listProps} commands={ungrouped} />{groupedContent}</>;
}

export const ProjectCommandSectionsX = observer(ProjectCommandSections);
