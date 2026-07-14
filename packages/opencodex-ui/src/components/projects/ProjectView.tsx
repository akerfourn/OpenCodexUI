/**
 * Renders one opened project workspace.
 */
import { observer } from "mobx-react-lite";

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
  function handleSidePanelCollapsedChange(value: boolean): void {
    projectStore.setSidePanelCollapsed(value);
  }

  return (
    <ResizableSidebarLayout
      className="workspace-shell"
      defaultSidebarWidth={320}
      sidebarWidth={projectStore.workspaceSidebarWidth}
      onSidebarWidthChange={(value) => projectStore.setWorkspaceSidebarWidth(value)}
      sidebar={<ProjectThreadListX store={store} projectStore={projectStore} />}
    >
      <ProjectWorkspaceLayout
        defaultPanelWidth={360}
        panelWidth={projectStore.sidePanelWidth}
        onPanelWidthChange={(value) => projectStore.setSidePanelWidth(value)}
        isSidePanelCollapsed={projectStore.isSidePanelCollapsed}
        mainPanel={(
          <section className="main-pane">
            <ChatViewX
              key={projectStore.selectedChatId ?? "empty-chat"}
              store={store}
              projectStore={projectStore}
            />
          </section>
        )}
        sidePanel={(
          <ProjectSidePanel
            store={store}
            projectStore={projectStore}
            isCollapsed={projectStore.isSidePanelCollapsed}
            onCollapsedChange={handleSidePanelCollapsedChange}
          />
        )}
      />
    </ResizableSidebarLayout>
  );
}

export const ProjectViewX = observer(ProjectView);
