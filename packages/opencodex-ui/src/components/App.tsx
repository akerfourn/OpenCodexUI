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
  const activeProjectStore = store.navigationStore.activeProjectStore;
  const mainContent = store.navigationStore.activeTabId === HOME_TAB_ID || activeProjectStore === null
    ? <HomeViewX store={store} />
    : <ProjectViewX store={store} projectStore={activeProjectStore} />;

  function handleCloseError(): void {
    store.appStore.clearErrorMessage();
  }

  function handleOpenLogs(): void {
    store.openLogsHome();
    store.appStore.clearErrorMessage();
  }

  return (
    <Box component="main" className="app-shell">
      <AppTabsX store={store} />
      <section className="app-content">
        {mainContent}
      </section>
      <ApprovalDialogX store={store.approvalsStore} />
      <ProjectTrustDialogX store={store.projectsStore.trustStore} />
      <CloseProjectDialogX store={store} />
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
    </Box>
  );
}

export const AppX = observer(App);
