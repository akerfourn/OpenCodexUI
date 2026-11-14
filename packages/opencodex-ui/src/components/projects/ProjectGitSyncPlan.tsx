import { Alert, Chip, Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useGitTranslation } from "../../i18n/useGitTranslation";
import type { OpenCodexGitSyncPlan } from "@open-codex-ui/opencodex-protocol";

interface ProjectGitSyncPlanProps { plan: OpenCodexGitSyncPlan; vocabulary?: "simple" | "technical" }

/** Displays fresh destination-specific counts and the action the user is about to authorize. */
export function ProjectGitSyncPlan({ plan, vocabulary }: ProjectGitSyncPlanProps) {
  const { t } = useGitTranslation(vocabulary);
  return (
    <Alert severity="info" icon={false}>
      <Stack spacing={1}>
        <Typography variant="subtitle2" sx={{ overflowWrap: "anywhere" }}>
          {t("gitSync.destination", { remote: plan.target.remoteName, branch: plan.target.branchName })}
        </Typography>
        <Typography variant="caption" sx={{ overflowWrap: "anywhere" }}>{plan.pushUrl}</Typography>
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 0.5 }}>
          <Chip size="small" label={t("gitSync.localCommits", { count: plan.aheadCount })} />
          <Chip size="small" label={t("gitSync.remoteCommits", { count: plan.behindCount })} />
        </Stack>
        <Typography variant="body2">{t(`gitSync.actions.${plan.action}`)}</Typography>
      </Stack>
    </Alert>
  );
}

export const ProjectGitSyncPlanX = observer(ProjectGitSyncPlan);
