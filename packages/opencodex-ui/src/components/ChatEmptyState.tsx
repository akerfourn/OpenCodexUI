import { Button, Stack, Typography } from "@mui/material";

import type { RootStore } from "../stores/RootStore";

type ChatEmptyStateProps = {
  store: RootStore;
};

export function ChatEmptyState({ store }: ChatEmptyStateProps) {
  function handleNewThread(): void {
    store.createThread();
  }

  return (
    <Stack className="empty-state" spacing={2} sx={{ alignItems: "center" }}>
      <Typography variant="h6" component="h2">
        Aucune conversation ouverte
      </Typography>
      <Button variant="contained" type="button" onClick={handleNewThread}>
        Démarrer un chat
      </Button>
    </Stack>
  );
}
