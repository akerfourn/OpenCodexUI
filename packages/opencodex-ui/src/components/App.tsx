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
  const activeTabId = store.navigationStore.activeTabId;
  const projectTabStores = store.navigationStore.projectTabStores;

  function handleCloseError(): void {
    store.appStore.clearErrorMessage();
  }

  function handleOpenLogs(): void {
    store.openLogsHome();
    store.appStore.clearErrorMessage();
  }

  const snackbar = (
    <Snackbar
      open={errorMessage !== null}
      message={errorMessage?.split("\n")[0] ?? ""}
      onClose={handleCloseError}
      action={(
        <Button color="inherit" size="small" onClick={handleOpenLogs}>
          {t("logs.viewLogs")}
        </Button>
      )}
    />
  );

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
        <div
          className={activeTabId === HOME_TAB_ID ? "app-view app-view-active" : "app-view app-view-hidden"}
          aria-hidden={activeTabId === HOME_TAB_ID ? undefined : true}
          tabIndex={activeTabId === HOME_TAB_ID ? undefined : -1}
        >
          <HomeViewX store={store} />
        </div>
        {projectTabStores.map((projectStore) => {
          const isActive = activeTabId === projectStore.project.id;

          return (
            <div
              key={projectStore.project.id}
              className={isActive ? "app-view app-view-active" : "app-view app-view-hidden"}
              aria-hidden={isActive ? undefined : true}
              tabIndex={isActive ? undefined : -1}
            >
              <ProjectViewX store={store} projectStore={projectStore} />
            </div>
          );
        })}
      </section>
      <ApprovalDialogX store={store.approvalsStore} />
      <ProjectTrustDialogX store={store.projectsStore.trustStore} />
      <CloseProjectDialogX store={store} />
      {snackbar}
    </Box>
  );
}

export const AppX = observer(App);
