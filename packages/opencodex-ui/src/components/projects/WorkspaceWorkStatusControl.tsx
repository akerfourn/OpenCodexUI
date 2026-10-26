import { Button, Chip, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexProjectWorkspace, OpenCodexWorkspaceWorkStatus } from "@open-codex-ui/opencodex-protocol";

/** Displays manual progress and its date separately from live activity and Git lock badges. */
export function WorkspaceWorkStatusControl({ workspace, disabled, onChange }: {
  workspace: OpenCodexProjectWorkspace; disabled: boolean;
  onChange(workspace: OpenCodexProjectWorkspace, status: OpenCodexWorkspaceWorkStatus): void;
}) {
  const { t, i18n } = useTranslation();
  if (workspace.isPrimary) {
    return <Typography variant="body2" color="text.secondary">{t("workspaceWorkStatus.primaryHelp")}</Typography>;
  }
  const status = workspace.workStatus ?? "active";
  const completed = status === "completed";
  const action = completed ? "workspaceWorkStatus.reopen" : "workspaceWorkStatus.complete";
  const timestamp = Date.parse(workspace.completedAt ?? "");
  let completion = null;
  if (completed && Number.isFinite(timestamp)) {
    const date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
    completion = <Typography variant="caption" color="text.secondary">{t("workspaceWorkStatus.completedAt", { date })}</Typography>;
  }
  const canChange = workspace.removedAt === null && workspace.movePending !== true && workspace.removalPending !== true;
  const actionButton = canChange ? <Button disabled={disabled} onClick={handleChange}>{t(action)}</Button> : null;

  /** Keeps changing status explicit; continuing a conversation never silently changes this annotation. */
  function handleChange(): void { onChange(workspace, completed ? "active" : "completed"); }

  return <Stack spacing={0.5}>
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
      <Chip size="small" variant="outlined" label={t(`workspaceWorkStatus.${status}`)} />{actionButton}
    </Stack>
    {completion}
  </Stack>;
}
export const WorkspaceWorkStatusControlX = observer(WorkspaceWorkStatusControl);
