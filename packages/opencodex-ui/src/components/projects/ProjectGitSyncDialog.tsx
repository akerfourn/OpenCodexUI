import {
  Accordion, AccordionDetails, AccordionSummary, Alert, Button, CircularProgress,
  Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useGitTranslation } from "../../i18n/useGitTranslation";
import type { ProjectGitSyncStore } from "../../stores/project/git/ProjectGitSyncStore";
import { ProjectGitSyncFieldsX } from "./ProjectGitSyncFields";
import { ProjectGitSyncPlanX } from "./ProjectGitSyncPlan";
import { ProjectGitSyncConflictsX } from "./ProjectGitSyncConflicts";

interface ProjectGitSyncDialogProps {
  sync: ProjectGitSyncStore;
  onOpenFile(path: string): void;
}

/** Presents an explicit Git review and restart-safe continuation/abort controls. */
export function ProjectGitSyncDialog({ sync, onOpenFile }: ProjectGitSyncDialogProps) {
  const { t } = useGitTranslation(sync.vocabulary);
  const [abortFingerprint, setAbortFingerprint] = useState<string | null>(null);
  const operation = sync.operation;
  useEffect(() => { setAbortFingerprint(null); }, [sync.isOpen, operation?.fingerprint]);
  /** Closes read-only phases without losing the source-owned result. */
  function handleClose(): void { sync.close(); }
  /** Refreshes the comparison without starting a merge or rebase. */
  function handleAnalyze(): void { void sync.analyze(); }
  /** Retries an initial inspection after the user fixes source access or Git configuration. */
  function handleRetry(): void { void sync.open(); }
  /** Rechecks the worktree's actual operation state after manual file edits. */
  function handleRefresh(): void { void sync.inspect(); }
  /** Executes only the currently displayed immutable review. */
  function handleExecute(): void { void sync.execute(); }
  /** Resumes Git using explicitly staged resolutions. */
  function handleContinue(): void { void sync.continueOperation(); }
  /** Captures the exact operation the user is choosing to abort. */
  function handleRequestAbort(): void { setAbortFingerprint(operation?.fingerprint ?? null); }
  /** Aborts only the still-visible reviewed operation. */
  function handleConfirmAbort(): void {
    if (abortFingerprint !== operation?.fingerprint) return;
    setAbortFingerprint(null);
    void sync.abortOperation();
  }
  /** Leaves the current integration running when the user cancels abort confirmation. */
  function handleCancelAbort(): void { setAbortFingerprint(null); }

  let content = <ProjectGitSyncFieldsX sync={sync} />;
  let actions = (
    <>
      <Button disabled={sync.isBusy || sync.remoteName.length === 0 || sync.branchName.trim().length === 0} onClick={handleAnalyze}>
        {t("gitSync.analyze")}
      </Button>
      <Button variant="contained" disabled={sync.isBusy || sync.plan === null} onClick={handleExecute}>{t("gitSync.execute")}</Button>
    </>
  );
  if (operation !== null) {
    content = <ProjectGitSyncConflictsX sync={sync} onOpenFile={onOpenFile} />;
    actions = (
      <>
        <Button disabled={sync.isBusy} onClick={handleRefresh}>{t("gitSync.refresh")}</Button>
        <Button color="warning" disabled={sync.isBusy || operation.kind === "other"} onClick={handleRequestAbort}>{t("gitSync.abort")}</Button>
        <Button variant="contained" disabled={sync.isBusy || operation.kind === "other" || operation.conflicts.length > 0}
          onClick={handleContinue}>{t("gitSync.continue")}</Button>
      </>
    );
  } else if (sync.inspection === null) {
    actions = <Button disabled={sync.isBusy} onClick={handleRetry}>{t("gitSync.retry")}</Button>;
  }
  let notice = null;
  if (sync.result?.issue != null) {
    let severity: "warning" | "error" = "warning";
    if (sync.result.outcome === "error") severity = "error";
    notice = <Alert severity={severity}>{t(`gitSync.issues.${sync.result.issue}`)}</Alert>;
  } else if (sync.result?.outcome === "synchronized") {
    notice = <Alert severity="success">{t("gitSync.synchronized")}</Alert>;
  } else if (sync.result?.outcome === "continued" || sync.result?.outcome === "aborted") {
    notice = <Alert severity="info">{t(`gitSync.${sync.result.outcome}`)}</Alert>;
  } else if (operation === null && sync.inspection !== null && sync.inspection.status.remotes.length === 0) {
    notice = <Alert severity="info">{t("gitSync.issues.noRemote")}</Alert>;
  } else if (operation === null && sync.inspection !== null && sync.inspection.status.branchName === null) {
    notice = <Alert severity="info">{t("gitSync.issues.detachedHead")}</Alert>;
  }
  let review = null;
  if (sync.plan !== null) review = <ProjectGitSyncPlanX plan={sync.plan} vocabulary={sync.vocabulary} />;
  let details = null;
  const technicalDetails = sync.result?.details ?? sync.preferenceError;
  if (technicalDetails != null) {
    details = <Accordion disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />}>{t("gitSync.details")}</AccordionSummary>
      <AccordionDetails><Typography component="pre" variant="caption" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {technicalDetails}
      </Typography></AccordionDetails>
    </Accordion>;
  }
  let preferenceError = null;
  if (sync.preferenceError !== null) preferenceError = <Alert severity="error">{t("gitSync.preferenceFailed")}</Alert>;
  let progress = null;
  if (sync.isBusy) progress = <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
    <CircularProgress size={18} /><Typography variant="body2">{t(`gitSync.phases.${sync.phase}`)}</Typography>
  </Stack>;
  let abortConfirmation = null;
  if (abortFingerprint !== null) {
    abortConfirmation = <Alert severity="warning">
      <Stack spacing={1}>
        <Typography variant="body2">{t("gitSync.abortDescription")}</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
          <Button onClick={handleCancelAbort}>{t("gitSync.cancel")}</Button>
          <Button color="warning" variant="contained" disabled={sync.isBusy || operation?.fingerprint !== abortFingerprint}
            onClick={handleConfirmAbort}>{t("gitSync.confirmAbort")}</Button>
        </Stack>
      </Stack>
    </Alert>;
  }

  return (
    <Dialog open={sync.isOpen} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{t("gitSync.title")}</DialogTitle>
      <DialogContent dividers><Stack spacing={2}>
        {progress}{notice}{preferenceError}{abortConfirmation}{content}{review}{details}
      </Stack></DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 0.5 }}>
        <Button disabled={sync.isMutating} onClick={handleClose}>{t("gitSync.close")}</Button>
        {actions}
      </DialogActions>
    </Dialog>
  );
}

export const ProjectGitSyncDialogX = observer(ProjectGitSyncDialog);
