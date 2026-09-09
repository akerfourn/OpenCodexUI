/** Reads project-tool activity inside the smallest possible observer. */
import type { ReactElement } from "react";
import { observer } from "mobx-react-lite";

import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ProjectSidePanelTabIndicator } from "./ProjectSidePanelTabIndicator";

export type ProjectSidePanelActivity = "git" | "commands" | "goals" | "compose" | "none";

type ProjectSidePanelTabActivityProps = {
  projectStore: ProjectStore;
  activity: ProjectSidePanelActivity;
  icon: ReactElement;
};

/** Renders one tab icon while observing only its own tool state. */
function ProjectSidePanelTabActivity({
  projectStore,
  activity,
  icon
}: ProjectSidePanelTabActivityProps) {
  const { hasActivity, color } = readActivityState(projectStore, activity);

  return (
    <ProjectSidePanelTabIndicator
      icon={icon}
      hasActivity={hasActivity}
      color={color}
    />
  );
}

export const ProjectSidePanelTabActivityX = observer(ProjectSidePanelTabActivity);

/** Reads only the observable fields needed by one side-panel tool. */
function readActivityState(
  projectStore: ProjectStore,
  activity: ProjectSidePanelActivity
): { hasActivity: boolean; color?: "error" | "warning" } {
  if (activity === "git") {
    const gitStore = projectStore.gitStore;
    const hasDraftMessage = gitStore?.commitStore?.hasDraftMessage === true;
    const hasProtectedBranch = gitStore?.isCurrentBranchCommitProtected === true;

    return {
      hasActivity: hasDraftMessage || hasProtectedBranch,
      color: hasDraftMessage ? "error" : "warning"
    };
  }

  if (activity === "commands") {
    return {
      hasActivity: projectStore.commandsStore?.hasActiveRun === true
    };
  }

  if (activity === "goals") {
    return {
      hasActivity: projectStore.goalsStore?.hasAttention === true
    };
  }

  if (activity === "compose") {
    return {
      hasActivity: projectStore.composeStore?.hasNonStoppedContainer === true
    };
  }

  return { hasActivity: false };
}
