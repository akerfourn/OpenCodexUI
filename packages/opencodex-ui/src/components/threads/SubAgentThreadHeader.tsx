import Breadcrumbs from "@mui/material/Breadcrumbs";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import {
  buildSubAgentBreadcrumbs,
  type SubAgentThreadBreadcrumb
} from "./subAgentThreadTreeModel";
import { resolveThreadLabel, translateAgentStatus } from "./SubAgentThreadTree";

type SubAgentThreadHeaderProps = {
  rootThread: OpenCodexThread;
  descendants: readonly OpenCodexThread[];
  currentThread: OpenCodexThread;
  sourceId: string | null;
  onNavigateRoot(): void;
  onSelectThread(threadId: string): void;
};

/**
 * Renders ancestry and agent metadata above a readonly sub-agent transcript.
 *
 * @param props Root, descendants, current thread, source, and navigation callbacks.
 * @returns Header with breadcrumbs and available agent metadata.
 */
export function SubAgentThreadHeader({
  rootThread,
  descendants,
  currentThread,
  sourceId,
  onNavigateRoot,
  onSelectThread
}: SubAgentThreadHeaderProps) {
  const { t } = useTranslation();
  const breadcrumbs = buildSubAgentBreadcrumbs(
    rootThread,
    descendants,
    currentThread,
    sourceId
  );
  const metadata = buildThreadMetadata(currentThread, t);

  return (
    <Stack
      component="header"
      spacing={0.75}
      sx={{ borderBottom: 1, borderColor: "divider", mb: 0.5, pb: 1.25 }}
    >
      <Breadcrumbs aria-label={t("sidebar.subAgentBreadcrumbs")} maxItems={6}>
        {breadcrumbs.map((breadcrumb, index) => (
          <SubAgentBreadcrumbItem
            key={breadcrumb.key}
            breadcrumb={breadcrumb}
            isCurrent={index === breadcrumbs.length - 1}
            rootThreadId={rootThread.id}
            onNavigateRoot={onNavigateRoot}
            onSelectThread={onSelectThread}
          />
        ))}
      </Breadcrumbs>
      <Typography variant="h6" component="h2">
        {resolveThreadLabel(currentThread)}
      </Typography>
      {metadata.length > 0 ? (
        <Stack direction="row" spacing={0.5} useFlexGap sx={{ flexWrap: "wrap" }}>
          {metadata.map((entry) => (
            <Chip key={entry} size="small" variant="outlined" label={entry} />
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}

type SubAgentBreadcrumbItemProps = {
  breadcrumb: SubAgentThreadBreadcrumb;
  isCurrent: boolean;
  rootThreadId: string;
  onNavigateRoot(): void;
  onSelectThread(threadId: string): void;
};

/** Renders one known, missing, or current breadcrumb segment. */
function SubAgentBreadcrumbItem({
  breadcrumb,
  isCurrent,
  rootThreadId,
  onNavigateRoot,
  onSelectThread
}: SubAgentBreadcrumbItemProps) {
  const { t } = useTranslation();

  if (breadcrumb.isMissing || breadcrumb.thread === null) {
    return (
      <Typography variant="caption" color="warning.main">
        {t("sidebar.subAgentMissingParent", { threadId: breadcrumb.threadId })}
      </Typography>
    );
  }

  const label = resolveThreadLabel(breadcrumb.thread);

  if (isCurrent) {
    return (
      <Typography variant="caption" color="text.primary" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
    );
  }

  function handleNavigate(): void {
    if (breadcrumb.threadId === rootThreadId) {
      onNavigateRoot();
      return;
    }

    onSelectThread(breadcrumb.threadId);
  }

  return (
    <Button size="small" onClick={handleNavigate} sx={{ minWidth: 0, p: 0 }}>
      {label}
    </Button>
  );
}

/** Builds unique chips for the available path, depth, role, model, and status. */
function buildThreadMetadata(
  thread: OpenCodexThread,
  translate: (key: string, values?: Record<string, unknown>) => string
): string[] {
  const agentPath = thread.subAgentSource?.agentPath ?? null;
  const depth = thread.subAgentSource?.depth ?? null;
  const status = thread.status ?? null;
  const entries = [
    agentPath,
    depth === null ? null : translate("sidebar.subAgentDepth", { depth }),
    thread.agentRole ?? thread.subAgentSource?.agentRole ?? null,
    thread.model,
    status === null ? null : translateAgentStatus(status, translate)
  ];

  return Array.from(new Set(entries.filter((entry): entry is string => (
    entry !== null && entry.trim().length > 0
  ))));
}
