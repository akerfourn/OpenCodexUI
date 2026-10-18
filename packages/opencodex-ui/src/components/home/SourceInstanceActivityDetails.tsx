import { Box, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { SourceInstanceActivity } from "@open-codex-ui/opencodex-protocol";

interface SourceInstanceActivityDetailsProps {
  activity: SourceInstanceActivity | undefined;
}

/** Makes an interruption decision reviewable using counts and RPC names, without exposing request contents. */
export function SourceInstanceActivityDetails({ activity }: SourceInstanceActivityDetailsProps) {
  const { t } = useTranslation();
  if (activity === undefined) return null;
  const reasons: { key: string; text: string }[] = [];
  if (activity.requestMethods.length > 0) {
    const methods = [...new Set(activity.requestMethods)].join(", ");
    reasons.push({ key: "requests", text: t("sourceInstances.requests", {
      count: activity.requestMethods.length, methods
    }) });
  }
  if (activity.turnCount > 0) {
    reasons.push({ key: "turns", text: t("sourceInstances.turns", { count: activity.turnCount }) });
  }
  if (activity.threadCount > 0) {
    reasons.push({ key: "threads", text: t("sourceInstances.threads", { count: activity.threadCount }) });
  }
  if (activity.approvalCount > 0) {
    reasons.push({ key: "approvals", text: t("sourceInstances.approvals", { count: activity.approvalCount }) });
  }
  if (activity.processCount > 0) {
    reasons.push({ key: "processes", text: t("sourceInstances.processes", { count: activity.processCount }) });
  }
  if (reasons.length === 0) return null;
  return (
    <Box component="ul" sx={{ pl: 2.5, my: 0.5, overflowWrap: "anywhere" }}>
      {reasons.map(reason => <Typography component="li" variant="body2" key={reason.key}>{reason.text}</Typography>)}
    </Box>
  );
}

export const SourceInstanceActivityDetailsX = observer(SourceInstanceActivityDetails);
