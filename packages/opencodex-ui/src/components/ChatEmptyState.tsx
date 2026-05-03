/**
 * Renders the chat empty state component for the OpenCodex UI.
 */
import { Button, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../stores/RootStore";

type ChatEmptyStateProps = {
  store: RootStore;
};

/**
 * Renders the chat empty state component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ChatEmptyState({ store }: ChatEmptyStateProps) {
  const { t } = useTranslation();

  function handleNewThread(): void {
    store.createThread();
  }

  return (
    <Stack className="empty-state" spacing={2} sx={{ alignItems: "center" }}>
      <Typography variant="h6" component="h2">
        {t("chat.empty")}
      </Typography>
      <Button variant="contained" type="button" onClick={handleNewThread}>
        {t("chat.start")}
      </Button>
    </Stack>
  );
}
