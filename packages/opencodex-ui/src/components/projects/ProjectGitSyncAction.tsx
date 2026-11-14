import { Alert, Button, CircularProgress, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useGitTranslation } from "../../i18n/useGitTranslation";
import type { ProjectGitStore } from "../../stores/project/git/ProjectGitStore";
import { ProjectGitSyncDialogX } from "./ProjectGitSyncDialog";

interface ProjectGitSyncActionProps {
  gitStore: ProjectGitStore;
  onOpenFile(path: string): void;
}

/** Keeps ordinary exchange one click away and offers an explicit advanced recovery when needed. */
export function ProjectGitSyncAction({ gitStore, onOpenFile }: ProjectGitSyncActionProps) {
  const { t } = useGitTranslation(gitStore.sync.vocabulary);
  const status = gitStore.statusStore.status;
  /** Opens a fresh comparison before authorizing an outgoing push. */
  function handleOpen(): void { void gitStore.sync.open(); }
  /** Opens the selected conflict in the existing file editor, leaving Git paused. */
  function handleOpenFile(path: string): void {
    gitStore.sync.close();
    onOpenFile(path);
  }
  /** Sends to the usual destination without automatic integration. */
  function handlePush(): void { void gitStore.sync.simple("push"); }
  /** Applies only a direct update from the usual destination. */
  function handlePull(): void { void gitStore.sync.simple("pull"); }
  const issue = gitStore.sync.simpleResult?.issue;
  let notice = null;
  let details = null;
  if (issue != null) {
    let action = null;
    if (issue !== "gitFailed" && issue !== "busy") {
      action = <Button size="small" onClick={handleOpen} disabled={!gitStore.sync.canOpen}>{t("gitSync.open")}</Button>;
    }
    notice = <Alert severity="warning" action={action}>{t(`gitSync.issues.${issue}`)}</Alert>;
    if (gitStore.sync.simpleResult?.details != null) {
      details = <details><summary>{t("gitSync.details")}</summary>
        <Typography component="pre" variant="caption" sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
          {gitStore.sync.simpleResult.details}
        </Typography>
      </details>;
    }
  }
  let destination = null;
  const target = status.synchronization?.target;
  if (target != null) {
    destination = <Typography variant="caption" color="text.secondary">
      {t("gitSync.destination", { remote: target.remoteName, branch: target.branchName })}
    </Typography>;
  }
  let pull = null;
  if (status.behindCount > 0) {
    pull = <Button variant="outlined" size="small" onClick={handlePull} disabled={!gitStore.sync.canOpen}>
      {t("git.pullChanges", { count: status.behindCount })}
    </Button>;
  }
  let push = null;
  if (status.aheadCount > 0) {
    push = <Button variant="outlined" size="small" onClick={handlePush} disabled={!gitStore.sync.canOpen}>
      {t("git.pushChanges", { count: status.aheadCount })}
    </Button>;
  }
  let progress = null;
  if (gitStore.sync.isBusy && !gitStore.sync.isOpen) progress = <CircularProgress size={16} />;
  return (
    <>
      <Stack spacing={1}>{destination}{notice}{details}<Stack direction="row" spacing={1}>{pull}{push}{progress}</Stack></Stack>
      <ProjectGitSyncDialogX sync={gitStore.sync} onOpenFile={handleOpenFile} />
    </>
  );
}

export const ProjectGitSyncActionX = observer(ProjectGitSyncAction);
