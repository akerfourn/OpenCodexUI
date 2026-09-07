import { Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";
import { WorkspaceStorageSettingsX } from "./WorkspaceStorageSettings";

/** Dedicated Home page; observable storage state is read by its observed child. */
export function HomeWorkspacesView({ store }: { store: RootStore }) {
  const { t } = useTranslation();
  return (
    <Stack className="home-content-panel" spacing={2}>
      <Typography variant="h5" component="h2">{t("home.workspaces")}</Typography>
      <WorkspaceStorageSettingsX store={store} />
    </Stack>
  );
}
