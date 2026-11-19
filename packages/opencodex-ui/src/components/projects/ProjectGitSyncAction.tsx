import { Alert, Button, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useGitTranslation } from "../../i18n/useGitTranslation";
import type { ProjectGitStore } from "../../stores/project/git/ProjectGitStore";
import { ProjectGitSyncDialogX } from "./ProjectGitSyncDialog";
import { ProjectGitSyncButton } from "./ProjectGitSyncButton";

interface ProjectGitSyncActionProps {
  gitStore: ProjectGitStore;
  onOpenFile(path: string): void;
}

/** Keeps ordinary exchange one click away and offers an explicit advanced recovery when needed. */
export function ProjectGitSyncAction({ gitStore, onOpenFile }: ProjectGitSyncActionProps) {
  const { t } = useGitTranslation(gitStore.sync.vocabulary);
  const status = gitStore.statusStore.status;
  const isPulling = gitStore.sync.simpleDirection === "pull";
  const isPushing = gitStore.sync.simpleDirection === "push";
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
  if (issue != null && gitStore.sync.simpleResult?.outcome !== "error") {
    let action = null;
    if (issue !== "gitFailed" && issue !== "busy") {
      action = <Button size="small" onClick={handleOpen} disabled={!gitStore.sync.canOpen}>{t("gitSync.open")}</Button>;
    }
    notice = <Alert severity="warning" action={action}>{t(`gitSync.issues.${issue}`)}</Alert>;
  }

  let destination = null;
  const target = status.synchronization?.target;
  if (target != null) {
    const label = t("gitSync.destination", { remote: target.remoteName, branch: target.branchName });
    destination = <Typography variant="caption" color="text.secondary" noWrap title={label}
      sx={{ flex: 1, minWidth: 0 }}>
      {label}
    </Typography>;
  }
  let pull = null;
  if (status.behindCount > 0 || isPulling) {
    const label = t("git.pullChanges", { count: status.behindCount });
    pull = <ProjectGitSyncButton direction="pull" label={label} isLoading={isPulling}
      disabled={!gitStore.sync.canOpen} onClick={handlePull} />;
  }
  let push = null;
  if (status.aheadCount > 0 || isPushing) {
    const label = t("git.pushChanges", { count: status.aheadCount });
    push = <ProjectGitSyncButton direction="push" label={label} isLoading={isPushing}
      disabled={!gitStore.sync.canOpen} onClick={handlePush} />;
  }
  let summary = null;
  if (destination !== null || pull !== null || push !== null) {
    summary = <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0, justifyContent: "flex-end" }}>
      {destination}
      <Stack direction="row" spacing={0.25} sx={{ alignItems: "center", flexShrink: 0 }}>{pull}{push}</Stack>
    </Stack>;
  }
  return (
    <>
      <Stack spacing={1}>{summary}{notice}</Stack>
      <ProjectGitSyncDialogX sync={gitStore.sync} onOpenFile={handleOpenFile} />
    </>
  );
}

export const ProjectGitSyncActionX = observer(ProjectGitSyncAction);
