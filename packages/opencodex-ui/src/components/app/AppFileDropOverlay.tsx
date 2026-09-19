import AttachFileOutlinedIcon from "@mui/icons-material/AttachFileOutlined";
import { Box, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";
import { registerAppFileDrop, type FileDropTarget } from "./appFileDrop";

/** Global drop feedback and attachment routing for the visible chat. */
export function AppFileDropOverlay({ store }: { store: RootStore }) {
  const { t } = useTranslation();
  const [isHovering, setIsHovering] = useState(false);
  const canDrop = getDropTarget(store) !== null;
  const label = canDrop ? t("composer.dropFiles") : t("composer.dropFilesUnavailable");

  useEffect(() => registerAppFileDrop(window, {
    getTarget: () => getDropTarget(store),
    onHover: setIsHovering,
    onError: (error) => store.appStore.applyError({
      type: "error", message: error instanceof Error ? error.message : String(error)
    }),
    directoryError: t("composer.dropDirectoriesUnsupported")
  }), [store, t]);

  if (!isHovering) { return null; }
  return (
    <Box role="status" sx={{ position: "fixed", inset: 12, zIndex: (theme) => theme.zIndex.modal + 1,
      pointerEvents: "none", display: "grid", placeItems: "center", border: "2px dashed",
      borderColor: "primary.main", borderRadius: 2, bgcolor: "background.paper", opacity: 0.95 }}>
      <Stack spacing={2} sx={{ alignItems: "center", p: 3 }}>
        <AttachFileOutlinedIcon color="primary" sx={{ fontSize: 48 }} />
        <Typography variant="h6" align="center">{label}</Typography>
      </Stack>
    </Box>
  );
}

/** Applies the same busy/read-only constraints as the composer attachment controls. */
export function getDropTarget(store: RootStore): FileDropTarget | null {
  const project = store.activeProjectStore;
  const chat = store.activeChatStore;
  if (project === null || chat === null || project.isReadOnlyFromCache
    || chat.composer.isSubmitting || store.appStore.isShuttingDown || store.appStore.shouldShowOnboarding) {
    return null;
  }
  const busy = chat.runtime.isWorking || chat.runtime.isStartingTurn || chat.runtime.isRecovering
    || project.threadListStore.loadingThreadId !== null;
  if (busy && !chat.actions.canSteerActiveTurn) { return null; }
  return chat.composer;
}

export const AppFileDropOverlayX = observer(AppFileDropOverlay);
