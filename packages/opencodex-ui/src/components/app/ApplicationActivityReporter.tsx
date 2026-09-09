/** Reports project activity without making the application shell observe it. */
import { observer } from "mobx-react-lite";
import { useEffect } from "react";

import type { RootStore } from "../../stores/RootStore";

type ApplicationActivityReporterProps = {
  store: RootStore;
};

/** Observes only the lifecycle activity aggregate and renders no UI. */
function ApplicationActivityReporter({ store }: ApplicationActivityReporterProps) {
  const hasPendingProjectActivity = store.hasPendingProjectActivity;

  useEffect(() => {
    store.reportApplicationActivity(hasPendingProjectActivity);
  }, [hasPendingProjectActivity, store]);

  return null;
}

export const ApplicationActivityReporterX = observer(ApplicationActivityReporter);
