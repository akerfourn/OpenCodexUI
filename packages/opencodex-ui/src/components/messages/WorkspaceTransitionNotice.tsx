import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexWorkspaceHistoryEndpoint, OpenCodexWorkspaceTransitionEvent } from "@open-codex-ui/opencodex-protocol";

/** A dated boundary keeps historical labels even after a workspace is renamed or removed. */
export function WorkspaceTransitionNotice({ event }: { event: OpenCodexWorkspaceTransitionEvent }) {
  const { t, i18n } = useTranslation();
  const from = endpointName(event.from, t("workspaces.primary"));
  const to = endpointName(event.to, t("workspaces.primary"));
  const timestamp = Date.parse(event.occurredAt);
  let date = "";
  if (Number.isFinite(timestamp)) {
    date = new Intl.DateTimeFormat(i18n.resolvedLanguage, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
  }
  return <Box role="note" sx={{ borderBlock: "1px solid", borderColor: "divider", py: 0.75, px: 1 }}>
    <Tooltip title={`${event.from.path} → ${event.to.path}`} placement="top" disableInteractive>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        <SwapHorizOutlinedIcon fontSize="small" color="action" />
        <Typography variant="caption" sx={{ overflowWrap: "anywhere", flex: 1 }}>
          {t("workspaceHistory.changed", { from, to })}
        </Typography>
        <Typography component="time" dateTime={event.occurredAt} variant="caption" color="text.secondary">{date}</Typography>
      </Stack>
    </Tooltip>
  </Box>;
}

/** Uses the captured label and source-native basename, independently of the host operating system. */
function endpointName(endpoint: OpenCodexWorkspaceHistoryEndpoint, primaryLabel: string): string {
  if (endpoint.isPrimary) return primaryLabel;
  return endpoint.name ?? endpoint.path.replace(/[\\/]+$/u, "").split(/[\\/]/u).at(-1) ?? endpoint.path;
}

export const WorkspaceTransitionNoticeX = observer(WorkspaceTransitionNotice);
