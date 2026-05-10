/**
 * Renders the app component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { Box } from "@mui/material";

import { HOME_TAB_ID, type RootStore } from "../stores/RootStore";
import { AppTabsX } from "./app/AppTabs";
import { ApprovalDialogX } from "./dialogs/ApprovalDialog";
import { HomeViewX } from "./home/HomeView";
import { ProjectTrustDialogX } from "./dialogs/ProjectTrustDialog";
import { CloseProjectDialogX } from "./dialogs/CloseProjectDialog";
import { ProjectViewX } from "./projects/ProjectView";

type AppProps = {
  store: RootStore;
};

/**
 * Renders the app component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function App({ store }: AppProps) {
  const errorContent = store.appStore.errorMessage === null ? null : (
    <pre className="error-banner">{store.appStore.errorMessage}</pre>
  );
  const activeProjectStore = store.navigationStore.activeProjectStore;
  const mainContent = store.navigationStore.activeTabId === HOME_TAB_ID || activeProjectStore === null
    ? <HomeViewX store={store} />
    : <ProjectViewX store={store} projectStore={activeProjectStore} />;

  return (
    <Box component="main" className="app-shell">
      <AppTabsX store={store} />
      <section className="app-content">
        {errorContent}
        {mainContent}
      </section>
      <ApprovalDialogX store={store.approvalsStore} />
      <ProjectTrustDialogX store={store.projectsStore.trustStore} />
      <CloseProjectDialogX store={store} />
    </Box>
  );
}

export const AppX = observer(App);
