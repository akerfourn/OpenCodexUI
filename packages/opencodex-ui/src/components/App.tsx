import { FileLinkMenuProviderX } from "./files/FileLinkMenuProvider";
import { FileLinkScope } from "./files/FileLinkScope";
/**
 * Renders the app component for the OpenCodex UI.
 */
import { DebugConsoleWindowX } from "./debug/DebugConsoleWindow";
import { FileCloseDialogX } from "./files/FileCloseDialog";
import { observer } from "mobx-react-lite";
import { Box } from "@mui/material";
import { ApplicationNotificationX } from "./app/ApplicationNotification";
import { ApplicationErrorProvider } from "./app/ApplicationErrorProvider";

import { HOME_TAB_ID, type RootStore } from "../stores/RootStore";
import { AppFileDropOverlayX } from "./app/AppFileDropOverlay";
import { AppShutdownOverlay } from "./app/AppShutdownOverlay";
import { AppCloseConfirmationDialogX } from "./app/AppCloseConfirmationDialog";
import { AppUpdateBannerX } from "./app/AppUpdateBanner";
import { ApplicationActivityReporterX } from "./app/ApplicationActivityReporter";
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
  const activeTabId = store.navigationStore.activeTabId;
  const activeProjectStore = store.navigationStore.activeProjectStore;
  const isInstalling = store.appUpdateStore.state.status === "installing";
  const overlayMode = isInstalling ? "update" : "shutdown";
  const shutdownOverlay = (
    <AppShutdownOverlay open={store.appStore.isShuttingDown || isInstalling} mode={overlayMode} />
  );
  const closeConfirmation = <><AppCloseConfirmationDialogX store={store} /><FileCloseDialogX store={store.fileCloseStore} /></>;
  const fileDropOverlay = <AppFileDropOverlayX store={store} />;
  const debugConsoleWindow = <DebugConsoleWindowX store={store.debugStore} />;
  const activityReporter = <ApplicationActivityReporterX store={store} />;

  const snackbar = <ApplicationNotificationX store={store} />;
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
      <ApplicationErrorProvider store={store}><FileLinkMenuProviderX store={store}>
      <FileLinkScope sourceId={null} projectPath={null}>
      <Box component="main" className="app-shell">
        <OnboardingViewX store={store} />
        {fileDropOverlay}
        {activityReporter}
        {debugConsoleWindow}
        {snackbar}
        {closeConfirmation}
        {shutdownOverlay}
      </Box>
      </FileLinkScope>
      </FileLinkMenuProviderX></ApplicationErrorProvider>
    );
  }

  return (
    <ApplicationErrorProvider store={store}><FileLinkMenuProviderX store={store}>
    <FileLinkScope sourceId={null} projectPath={null}>
    <Box component="main" className="app-shell">
      <AppTabsX store={store} />
      <AppUpdateBannerX store={store.appUpdateStore} />
      <section className="app-content">
        {activeView}
      </section>
      <ApprovalDialogX store={store.approvalsStore} />
      <ProjectTrustDialogX store={store.projectsStore.trustStore} />
      <CloseProjectDialogX store={store} />
      {fileDropOverlay}
      {activityReporter}
      {debugConsoleWindow}
      {snackbar}
      {closeConfirmation}
      {shutdownOverlay}
    </Box>
    </FileLinkScope>
    </FileLinkMenuProviderX></ApplicationErrorProvider>
  );
}

export const AppX = observer(App);
