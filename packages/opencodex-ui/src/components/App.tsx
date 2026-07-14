/**
 * Renders the app component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { Box, Button, Snackbar } from "@mui/material";
import { useTranslation } from "react-i18next";

import { HOME_TAB_ID, type RootStore } from "../stores/RootStore";
import { AppTabsX } from "./app/AppTabs";
import { ApprovalDialogX } from "./dialogs/ApprovalDialog";
import { HomeViewX } from "./home/HomeView";
import { OnboardingViewX } from "./onboarding/OnboardingView";
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
  const { t } = useTranslation();
  const errorMessage = store.appStore.errorMessage;
  const warningMessage = store.appStore.warningMessage;
  const notificationMessage = errorMessage ?? warningMessage;
  const activeTabId = store.navigationStore.activeTabId;
  const activeProjectStore = store.navigationStore.activeProjectStore;

  function handleCloseNotification(): void {
    if (errorMessage !== null) {
      store.appStore.clearErrorMessage();
      return;
    }

    store.appStore.clearWarningMessage();
  }

  function handleOpenLogs(): void {
    store.openLogsHome();
    store.appStore.clearErrorMessage();
    store.appStore.clearWarningMessage();
  }

  const snackbar = (
    <Snackbar
      open={notificationMessage !== null}
      message={notificationMessage?.split("\n")[0] ?? ""}
      onClose={handleCloseNotification}
      action={(
        <Button color="inherit" size="small" onClick={handleOpenLogs}>
          {t("logs.viewLogs")}
        </Button>
      )}
    />
  );
  let activeView = null;

  if (activeTabId === HOME_TAB_ID) {
    activeView = (
      <div className="app-view">
        <HomeViewX store={store} />
      </div>
    );
  } else if (activeProjectStore !== null) {
    activeView = (
      <div key={activeProjectStore.project.id} className="app-view">
        <ProjectViewX store={store} projectStore={activeProjectStore} />
      </div>
    );
  }

  if (store.appStore.shouldShowOnboarding) {
    return (
      <Box component="main" className="app-shell">
        <OnboardingViewX store={store} />
        {snackbar}
      </Box>
    );
  }

  return (
    <Box component="main" className="app-shell">
      <AppTabsX store={store} />
      <section className="app-content">
        {activeView}
      </section>
      <ApprovalDialogX store={store.approvalsStore} />
      <ProjectTrustDialogX store={store.projectsStore.trustStore} />
      <CloseProjectDialogX store={store} />
      {snackbar}
    </Box>
  );
}

export const AppX = observer(App);
