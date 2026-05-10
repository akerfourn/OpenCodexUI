/**
 * Renders the chat empty state component for the OpenCodex UI.
 */
import { Button, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { ProjectStore } from "../../stores/ProjectStore";

type ChatEmptyStateProps = {
  projectStore: ProjectStore | null;
};

/**
 * Renders the chat empty state component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ChatEmptyState({ projectStore }: ChatEmptyStateProps) {
  const { t } = useTranslation();

  function handleNewThread(): void {
    projectStore?.createThread();
  }

  return (
    <Stack className="empty-state" spacing={2} sx={{ alignItems: "center" }}>
      <Typography variant="h6" component="h2">
        {t("chat.empty")}
      </Typography>
      <Button
        variant="contained"
        type="button"
        disabled={projectStore === null || projectStore.isOrphan}
        onClick={handleNewThread}
      >
        {t("chat.start")}
      </Button>
    </Stack>
  );
}
