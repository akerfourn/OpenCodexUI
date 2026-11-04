import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Stack, Typography
} from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ProjectStore } from "../../stores/project/ProjectStore";
import type { RootStore } from "../../stores/RootStore";
import { ThreadRepairStore } from "../../stores/chat/ThreadRepairStore";

interface ThreadRepairDialogProps {
  threadId: string;
  sourceId: string | null;
  title: string;
  project: ProjectStore;
  root: RootStore;
  onClose(): void;
}

/** Exposes repair before any error and reports verified success or a retained blocker. */
export function ThreadRepairDialog({ threadId, sourceId, title, project, root, onClose }: ThreadRepairDialogProps) {
  const { t } = useTranslation();
  const [store] = useState(() => new ThreadRepairStore(threadId, sourceId, project, root));
  useEffect(() => {
    store.activate();
    return () => store.dispose();
  }, [store]);

  /** Starts verification only after the user has reviewed its scope. */
  function handleRepair(): void {
    void store.repair();
  }

  let result = null;
  if (store.isComplete) {
    result = <Alert severity="success" role="status">{t("threadRepair.success")}</Alert>;
  } else if (store.error !== null) {
    const message = store.isReconciled ? t("threadRepair.refreshFailed") : t("threadRepair.failed");
    result = <Alert severity="warning">
      {message}
      <Box component="details" sx={{ mt: 1 }}>
        <Box component="summary" sx={{ cursor: "pointer" }}>{t("threadRepair.details")}</Box>
        <Typography variant="caption" component="pre" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {store.error}
        </Typography>
      </Box>
    </Alert>;
  }
  const progress = store.isBusy ? <Stack direction="row" spacing={1} sx={{ alignItems: "center" }} role="status">
    <CircularProgress size={18} />
    <Typography variant="body2">{t("threadRepair.checking")}</Typography>
  </Stack> : null;
  const actionLabel = store.isReconciled ? t("threadRepair.refresh") : t("threadRepair.submit");
  const repairAction = store.isComplete ? null : (
    <Button variant="contained" onClick={handleRepair} disabled={!store.canRepair}>{actionLabel}</Button>
  );

  return <Dialog open fullWidth maxWidth="sm" onClose={store.isBusy ? undefined : onClose}>
    <DialogTitle>{t("threadRepair.title")}</DialogTitle>
    <DialogContent>
      <Stack spacing={2}>
        <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>{title}</Typography>
        <DialogContentText>{t("threadRepair.description")}</DialogContentText>
        <DialogContentText>{t("threadRepair.safety")}</DialogContentText>
        {progress}
        {result}
      </Stack>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={store.isBusy}>{t("threadRepair.close")}</Button>
      {repairAction}
    </DialogActions>
  </Dialog>;
}

export const ThreadRepairDialogX = observer(ThreadRepairDialog);
