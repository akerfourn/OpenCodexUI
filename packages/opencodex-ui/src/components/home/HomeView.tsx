/**
 * Renders the Home tab.
 */
import { observer } from "mobx-react-lite";

import type { RootStore } from "../../stores/RootStore";
import { ResizableSidebarLayout } from "../layout/ResizableSidebarLayout";
import { HomeProjectsViewX } from "./HomeProjectsView";
import { HomeSettingsViewX } from "./HomeSettingsView";
import { HomeSidebarX } from "./HomeSidebar";

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
  const mainContent = store.homeStore.selectedSection === "settings"
    ? <HomeSettingsViewX store={store} />
    : <HomeProjectsViewX store={store} />;

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
