/**
 * Renders one opened project workspace.
 */
import { observer } from "mobx-react-lite";
import { useCallback, useState } from "react";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ChatViewX } from "../chat/ChatView";
import { ResizableSidebarLayout } from "../layout/ResizableSidebarLayout";
import { ProjectSidePanelX } from "./ProjectSidePanel";
import { ProjectThreadListX } from "./ProjectThreadList";
import { ProjectWorkspaceLayout } from "./ProjectWorkspaceLayout";
import { SubAgentThreadsDialogX } from "../threads/SubAgentThreadsDialog";
import type {
  OpenSubAgentDialog,
  SubAgentDialogRequest
} from "../threads/subAgentDialog";

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
  const layoutStore = projectStore.layoutStore;
  const [subAgentDialogRequest, setSubAgentDialogRequest] = useState<
    SubAgentDialogRequest | null
  >(null);

  function handleSidePanelCollapsedChange(value: boolean): void {
    layoutStore.setSidePanelCollapsed(value);
  }

  const handleOpenSubAgentDialog = useCallback<OpenSubAgentDialog>((
    rootThread,
    selectedThreadId = null
  ) => {
    setSubAgentDialogRequest({ rootThread, selectedThreadId });
  }, []);

  function handleCloseSubAgentDialog(): void {
    setSubAgentDialogRequest(null);
  }

  return (
    <>
      <ResizableSidebarLayout
        className="workspace-shell"
        defaultSidebarWidth={320}
        sidebarWidth={layoutStore.workspaceSidebarWidth}
        onSidebarWidthChange={(value) => layoutStore.setWorkspaceSidebarWidth(value)}
        sidebar={(
          <ProjectThreadListX
            store={store}
            projectStore={projectStore}
            onOpenSubAgentDialog={handleOpenSubAgentDialog}
          />
        )}
      >
        <ProjectWorkspaceLayout
          defaultPanelWidth={360}
          panelWidth={layoutStore.sidePanelWidth}
          onPanelWidthChange={(value) => layoutStore.setSidePanelWidth(value)}
          isSidePanelCollapsed={layoutStore.isSidePanelCollapsed}
          mainPanel={(
            <section className="main-pane">
              <ChatViewX
                key={projectStore.selectedChatId ?? "empty-chat"}
                store={store}
                projectStore={projectStore}
                onOpenSubAgentDialog={handleOpenSubAgentDialog}
              />
            </section>
          )}
          sidePanel={(
            <ProjectSidePanelX
              store={store}
              projectStore={projectStore}
              isCollapsed={layoutStore.isSidePanelCollapsed}
              onCollapsedChange={handleSidePanelCollapsedChange}
            />
          )}
        />
      </ResizableSidebarLayout>
      {subAgentDialogRequest !== null ? (
        <SubAgentThreadsDialogX
          open
          parentThread={subAgentDialogRequest.rootThread}
          initialSelectedThreadId={subAgentDialogRequest.selectedThreadId}
          projectStore={projectStore}
          onClose={handleCloseSubAgentDialog}
        />
      ) : null}
    </>
  );
}

export const ProjectViewX = observer(ProjectView);
