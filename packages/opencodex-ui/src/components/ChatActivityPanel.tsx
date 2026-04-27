import { observer } from "mobx-react-lite";

import type { RootStore } from "../stores/RootStore";

type ChatActivityPanelProps = {
  store: RootStore;
};

export const ChatActivityPanel = observer(function ChatActivityPanel({ store }: ChatActivityPanelProps) {
  if (!store.settings.showActivityPanel) {
    return null;
  }

  if (store.activity.length === 0) {
    return null;
  }

  return (
    <details className="activity-panel" open={store.isWorking}>
      <summary>Activité en cours</summary>
      <ul>
        {store.activity.slice(-20).map((activity, index) => (
          <li key={`${index}-${activity}`}>{activity}</li>
        ))}
      </ul>
    </details>
  );
});
