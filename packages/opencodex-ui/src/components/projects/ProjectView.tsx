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
  return (
    <ResizableSidebarLayout
      className="workspace-shell"
      defaultSidebarWidth={320}
      sidebar={<ProjectThreadListX store={store} projectStore={projectStore} />}
    >
      <section className="project-workspace-main">
        <section className="main-pane">
          <ChatViewX store={store} projectStore={projectStore} />
        </section>
        <ProjectSidePanel store={store} projectStore={projectStore} />
      </section>
    </ResizableSidebarLayout>
  );
}

export const ProjectViewX = observer(ProjectView);
