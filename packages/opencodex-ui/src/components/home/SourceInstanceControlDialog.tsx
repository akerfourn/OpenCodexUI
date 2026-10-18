import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, FormControlLabel, Stack } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useState, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import type { SourceInstancesStore } from "../../stores/app/SourceInstancesStore";
import { SourceInstanceActivityDetailsX } from "./SourceInstanceActivityDetails";

interface SourceInstanceControlDialogProps {
  sourceId: string;
  sourceName: string;
  instances: SourceInstancesStore;
  action: "stop" | "restart";
  onClose(): void;
}

/** Requires a fresh acknowledgement before interrupting busy or still-initializing instances. */
export function SourceInstanceControlDialog({ sourceId, sourceName, instances, action,
  onClose }: SourceInstanceControlDialogProps) {
  const { t } = useTranslation();
  const [force, setForce] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const snapshot = instances.states.get(sourceId);
  const isBusy = snapshot?.isActive === true || snapshot?.phase === "starting";
  const error = instances.errors.get(sourceId);
  const requiresForce = isBusy || error?.startsWith("SOURCE_BUSY") === true;
  const canSubmit = snapshot !== undefined && snapshot.phase !== "stopping" && snapshot.phase !== "updating"
    && !isSubmitting && (!requiresForce || force);
  const titleKey = action === "stop" ? "sourceInstances.confirmStop" : "sourceInstances.confirmRestart";
  const actionKey = action === "stop" ? "sourceInstances.stop" : "sourceInstances.restart";

  /** Changes only local confirmation state; it never sends an implicit forced retry. */
  function handleForce(event: ChangeEvent<HTMLInputElement>): void {
    setForce(event.target.checked);
  }
  /** Keeps a rejected normal action open so a busy-state race can be explicitly acknowledged. */
  async function handleConfirm(): Promise<void> {
    if (!canSubmit) return;
    setIsSubmitting(true);
    const succeeded = await instances.control(sourceId, action, requiresForce && force);
    setIsSubmitting(false);
    if (succeeded) onClose();
  }
  /** Prevents dismissing an in-flight shutdown whose result is not known yet. */
  function handleCancel(): void {
    if (!isSubmitting) onClose();
  }

  let startupContent = null;
  if (snapshot?.phase === "starting") startupContent = <DialogContentText>{t("sourceInstances.startingReason")}</DialogContentText>;
  let activityContent = <DialogContentText>{t("sourceInstances.idle")}</DialogContentText>;
  if (snapshot?.phase === "updating") {
    activityContent = <DialogContentText>{t("sourceInstances.updating")}</DialogContentText>;
  } else if (requiresForce) activityContent = (
    <Stack spacing={2}>
      <Alert severity="warning">
        {t("sourceInstances.busy")}
        <SourceInstanceActivityDetailsX activity={snapshot?.activity} />
      </Alert>
      {startupContent}
      <FormControlLabel control={<Checkbox checked={force} onChange={handleForce} disabled={isSubmitting} />}
        label={t("sourceInstances.force")} />
      <DialogContentText>{t("sourceInstances.forceHelp")}</DialogContentText>
    </Stack>
  );
  let errorContent = null;
  if (error !== undefined) errorContent = <Alert severity="error">{error}</Alert>;

  return (
    <Dialog open onClose={handleCancel} fullWidth maxWidth="sm" aria-labelledby="source-instance-control-title">
      <DialogTitle id="source-instance-control-title">{t(titleKey, { name: sourceName })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <DialogContentText>{t("sourceInstances.scope")}</DialogContentText>
          {activityContent}
          {errorContent}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={isSubmitting} onClick={handleCancel}>{t("sourceInstances.cancel")}</Button>
        <Button color="warning" variant="contained" disabled={!canSubmit} onClick={handleConfirm}>{t(actionKey)}</Button>
      </DialogActions>
    </Dialog>
  );
}

export const SourceInstanceControlDialogX = observer(SourceInstanceControlDialog);
