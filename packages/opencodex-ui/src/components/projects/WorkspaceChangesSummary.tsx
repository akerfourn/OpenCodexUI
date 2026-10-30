import { Alert, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexWorkspaceChanges } from "@open-codex-ui/opencodex-protocol";

/** Separates observation dates from actual edit times and keeps cached results visibly stale. */
export function WorkspaceChangesSummary({ changes, error }: { changes?: OpenCodexWorkspaceChanges; error?: string }) {
  const { t, i18n } = useTranslation();
  let content = <Typography variant="body2" color="text.secondary">{t("workspaceChanges.unknown")}</Typography>;
  if (changes !== undefined) {
    const format = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" });
    const checkedAt = format.format(Date.parse(changes.checkedAt));
    let activity = t("workspaceChanges.baseline");
    if (changes.lastChangedAt !== null && Number.isFinite(Date.parse(changes.lastChangedAt))) {
      activity = t("workspaceChanges.changedAt", { date: format.format(Date.parse(changes.lastChangedAt)) });
    }
    let state = t("workspaceChanges.clean");
    if (changes.hasChanges) state = t("workspaceChanges.modified");
    if (changes.state === "cached") state = t("workspaceChanges.cached");
    if (changes.state === "partial") state = t("workspaceChanges.partial");
    content = <Stack>
      <Typography variant="body2">{activity}</Typography>
      <Typography variant="caption" color="text.secondary">{t("workspaceChanges.checkedAt", { date: checkedAt })} — {state}</Typography>
    </Stack>;
  }
  const failure = error === undefined ? null : <Alert severity="warning" title={error}>{t("workspaceChanges.unavailable")}</Alert>;
  return <Stack spacing={1}>{content}{failure}</Stack>;
}

export const WorkspaceChangesSummaryX = observer(WorkspaceChangesSummary);
