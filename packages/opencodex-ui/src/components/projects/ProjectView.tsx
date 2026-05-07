/**
 * Renders one opened project workspace.
 */
import { observer } from "mobx-react-lite";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ChatViewX } from "../ChatView";
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
    <section className="workspace-shell">
      <ProjectThreadListX store={store} projectStore={projectStore} />
      <section className="main-pane">
        <ChatViewX store={store} />
      </section>
    </section>
  );
}

export const ProjectViewX = observer(ProjectView);
