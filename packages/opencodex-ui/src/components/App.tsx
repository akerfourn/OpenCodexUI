import { observer } from "mobx-react-lite";
import { Box } from "@mui/material";

import type { RootStore } from "../stores/RootStore";
import { ApprovalDialog } from "./ApprovalDialog";
import { ChatView } from "./ChatView";
import { ThreadList } from "./ThreadList";

type AppProps = {
  store: RootStore;
};

export const App = observer(function App({ store }: AppProps) {
  const errorContent = store.errorMessage === null ? null : (
    <pre className="error-banner">{store.errorMessage}</pre>
  );

  return (
    <Box component="main" className="app-shell">
      <ThreadList store={store} />
      <section className="main-pane">
        {errorContent}
        <ChatView store={store} />
      </section>
      <ApprovalDialog store={store} />
    </Box>
  );
});
