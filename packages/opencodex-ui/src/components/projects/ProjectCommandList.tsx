import { observer } from "mobx-react-lite";
import type { OpenCodexProjectCommand } from "@open-codex-ui/opencodex-protocol";
import type { ProjectCommandsStore, ProjectCommandRunView } from "../../stores/project/ProjectCommandsStore";
import { ProjectCommandCardX } from "./ProjectCommandCard";

/** Renders one ordering section, keeping movement controls within the visible section. */
export function ProjectCommandList({ commands, commandsStore, onEdit, onOpenLogs }: {
  commands: OpenCodexProjectCommand[];
  commandsStore: ProjectCommandsStore;
  onEdit(command: OpenCodexProjectCommand): void;
  onOpenLogs(run: ProjectCommandRunView): void;
}) {
  return <>{commands.map((command, index) => <ProjectCommandCardX key={command.id} command={command}
    commandsStore={commandsStore} runs={commandsStore.getRuns(command.id)}
    canMoveUp={index > 0} canMoveDown={index < commands.length - 1}
    onEdit={onEdit} onOpenLogs={onOpenLogs} />)}</>;
}

export const ProjectCommandListX = observer(ProjectCommandList);
