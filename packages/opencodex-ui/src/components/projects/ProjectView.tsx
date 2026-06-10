/**
 * Renders one opened project workspace.
 */
import { observer } from "mobx-react-lite";
import { useState } from "react";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ChatViewX } from "../chat/ChatView";
import { ResizableSidebarLayout } from "../layout/ResizableSidebarLayout";
import { ProjectSidePanel } from "./ProjectSidePanel";
import { ProjectThreadListX } from "./ProjectThreadList";
import { ProjectWorkspaceLayout } from "./ProjectWorkspaceLayout";

type ProjectViewProps = {
  store: RootStore;
  projectStore: ProjectStore;
};

/**
 * Renders the project workspace layout.
 *
 * @param props Component props.
 *
 * @returns Rendered project view.
 */
export function ProjectView({ store, projectStore }: ProjectViewProps) {
  const [isSidePanelCollapsed, setIsSidePanelCollapsed] = useState(false);

  function handleSidePanelCollapsedChange(value: boolean): void {
    setIsSidePanelCollapsed(value);
  }

  return (
    <ResizableSidebarLayout
      className="workspace-shell"
      defaultSidebarWidth={320}
      sidebar={<ProjectThreadListX store={store} projectStore={projectStore} />}
    >
      <ProjectWorkspaceLayout
        defaultPanelWidth={360}
        isSidePanelCollapsed={isSidePanelCollapsed}
        mainPanel={(
          <section className="main-pane">
            <ChatViewX store={store} projectStore={projectStore} />
          </section>
        )}
        sidePanel={(
          <ProjectSidePanel
            store={store}
            projectStore={projectStore}
            isCollapsed={isSidePanelCollapsed}
            onCollapsedChange={handleSidePanelCollapsedChange}
          />
        )}
      />
    </ResizableSidebarLayout>
  );
}

export const ProjectViewX = observer(ProjectView);
