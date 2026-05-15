/**
 * Renders the Home tab.
 */
import { observer } from "mobx-react-lite";

import type { RootStore } from "../../stores/RootStore";
import { ResizableSidebarLayout } from "../layout/ResizableSidebarLayout";
import { HomeCommitViewX } from "./HomeCommitView";
import { HomeLogsViewX } from "./HomeLogsView";
import { HomeProjectsViewX } from "./HomeProjectsView";
import { HomeSettingsViewX } from "./HomeSettingsView";
import { HomeSidebarX } from "./HomeSidebar";
import { HomeSourcesViewX } from "./HomeSourcesView";

type HomeViewProps = {
  store: RootStore;
};

/**
 * Renders Home layout.
 *
 * @param props Component props.
 *
 * @returns Rendered Home view.
 */
export function HomeView({ store }: HomeViewProps) {
  let mainContent = <HomeProjectsViewX store={store} />;

  if (store.homeStore.selectedSection === "sources") {
    mainContent = <HomeSourcesViewX store={store} />;
  }

  if (store.homeStore.selectedSection === "settings") {
    mainContent = <HomeSettingsViewX store={store} />;
  }

  if (store.homeStore.selectedSection === "commit") {
    mainContent = <HomeCommitViewX store={store} />;
  }

  if (store.homeStore.selectedSection === "logs") {
    mainContent = <HomeLogsViewX store={store} />;
  }

  return (
    <ResizableSidebarLayout
      className="home-shell"
      defaultSidebarWidth={300}
      sidebar={<HomeSidebarX store={store} />}
    >
      <main className="home-main">
        {mainContent}
      </main>
    </ResizableSidebarLayout>
  );
}

export const HomeViewX = observer(HomeView);
