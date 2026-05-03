import { observer } from "mobx-react-lite";
import { Box } from "@mui/material";

import type { RootStore } from "../stores/RootStore";
import { ApprovalDialogX } from "./ApprovalDialog";
import { ChatViewX } from "./ChatView";
import { ProjectTrustDialogX } from "./ProjectTrustDialog";
import { ThreadListX } from "./ThreadList";

type AppProps = {
  store: RootStore;
};

export function App({ store }: AppProps) {
  const errorContent = store.errorMessage === null ? null : (
    <pre className="error-banner">{store.errorMessage}</pre>
  );

  return (
    <Box component="main" className="app-shell">
      <ThreadListX store={store} />
      <section className="main-pane">
        {errorContent}
        <ChatViewX store={store} />
      </section>
      <ApprovalDialogX store={store} />
      <ProjectTrustDialogX store={store} />
    </Box>
  );
}

export const AppX = observer(App);
