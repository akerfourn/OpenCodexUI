/**
 * Renders the Home tab.
 */
import { observer } from "mobx-react-lite";

import type { RootStore } from "../../stores/RootStore";
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
    <section className="home-shell">
      <HomeSidebarX store={store} />
      <main className="home-main">
        {mainContent}
      </main>
    </section>
  );
}

export const HomeViewX = observer(HomeView);
