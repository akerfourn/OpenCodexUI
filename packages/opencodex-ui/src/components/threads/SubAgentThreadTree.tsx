import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import {
  Box,
  List,
  ListItemButton,
  ListItemIcon,
  Stack,
  Typography
} from "@mui/material";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import type { SubAgentThreadTreeNode } from "./subAgentThreadTreeModel";

type SubAgentThreadTreeProps = {
  rootThread: OpenCodexThread;
  nodes: readonly SubAgentThreadTreeNode[];
  selectedThreadId: string | null;
  onNavigateRoot(): void;
  onSelectThread(threadId: string): void;
};

type SubAgentThreadBranchProps = {
  node: SubAgentThreadTreeNode;
  level: number;
  selectedThreadId: string | null;
  onSelectThread(threadId: string): void;
};

/**
 * Renders the root and nested descendants of one source-aware agent hierarchy.
 *
 * @param props Root metadata, structural nodes, selection, and navigation callbacks.
 * @returns Hierarchical thread list.
 */
export function SubAgentThreadTree({
  rootThread,
  nodes,
  selectedThreadId,
  onNavigateRoot,
  onSelectThread
}: SubAgentThreadTreeProps) {
  const { t } = useTranslation();

  return (
    <List
      dense
      disablePadding
      role="tree"
      aria-label={t("sidebar.subAgentHierarchy")}
      sx={{ minWidth: 0 }}
    >
      <ListItemButton
        role="treeitem"
        aria-level={1}
        onClick={onNavigateRoot}
        sx={{ minWidth: 0, pl: 1.25, pr: 1 }}
      >
        <ListItemIcon sx={{ color: "primary.main", minWidth: 30 }}>
          <AccountTreeOutlinedIcon fontSize="small" />
        </ListItemIcon>
        <Stack sx={{ minWidth: 0 }}>
          <Typography variant="caption" color="text.secondary" noWrap>
            {t("sidebar.subAgentTreeRoot")}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {resolveThreadLabel(rootThread)}
          </Typography>
        </Stack>
      </ListItemButton>
      {nodes.map((node) => (
        <SubAgentThreadBranch
          key={node.key}
          node={node}
          level={1}
          selectedThreadId={selectedThreadId}
          onSelectThread={onSelectThread}
        />
      ))}
    </List>
  );
}

/** Renders one recursive hierarchy branch with explicit tree depth metadata. */
function SubAgentThreadBranch({
  node,
  level,
  selectedThreadId,
  onSelectThread
}: SubAgentThreadBranchProps) {
  const { t } = useTranslation();
  const thread = node.thread;
  const agentPath = thread.subAgentSource?.agentPath ?? null;
  const reportedDepth = thread.subAgentSource?.depth;
  const displayedDepth = reportedDepth ?? level;
  const primaryMetadata = [thread.agentRole, thread.model]
    .filter((value): value is string => value !== null && value.length > 0)
    .join(" · ");
  const status = thread.status ?? "unknown";
  const statusLabel = translateAgentStatus(status, t);

  function handleSelectThread(): void {
    onSelectThread(thread.id);
  }

  return (
    <Fragment>
      <ListItemButton
        role="treeitem"
        aria-level={level + 1}
        aria-expanded={node.children.length > 0 ? true : undefined}
        data-thread-id={thread.id}
        data-thread-depth={level}
        data-thread-orphan={node.isOrphan ? "true" : undefined}
        selected={thread.id === selectedThreadId}
        onClick={handleSelectThread}
        sx={{
          minWidth: 0,
          pl: 1.25 + level * 2,
          pr: 1,
          position: "relative",
          "&:before": {
            bgcolor: "divider",
            content: '""',
            height: "100%",
            left: 14 + (level - 1) * 16,
            position: "absolute",
            top: 0,
            width: "1px"
          }
        }}
      >
        <ListItemIcon sx={{ color: "text.secondary", minWidth: 30 }}>
          {node.isOrphan ? (
            <WarningAmberOutlinedIcon color="warning" fontSize="small" />
          ) : (
            <SmartToyOutlinedIcon fontSize="small" />
          )}
        </ListItemIcon>
        <Stack spacing={0.1} sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
            {resolveThreadLabel(thread)}
          </Typography>
          {primaryMetadata.length > 0 ? (
            <Typography variant="caption" color="text.secondary" noWrap>
              {primaryMetadata}
            </Typography>
          ) : null}
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", minWidth: 0 }}>
            <Box
              component="span"
              sx={{
                bgcolor: resolveStatusColor(status),
                borderRadius: "50%",
                flex: "0 0 auto",
                height: 7,
                width: 7
              }}
            />
            <Typography variant="caption" color="text.secondary" noWrap>
              {statusLabel}
              {` · ${t("sidebar.subAgentDepth", { depth: displayedDepth })}`}
              {agentPath === null ? "" : ` · ${agentPath}`}
            </Typography>
          </Stack>
          {node.isOrphan ? (
            <Typography variant="caption" color="warning.main" noWrap>
              {t("sidebar.subAgentParentUnavailable", {
                threadId: node.missingParentThreadId ?? "?"
              })}
            </Typography>
          ) : null}
        </Stack>
      </ListItemButton>
      {node.children.map((childNode) => (
        <SubAgentThreadBranch
          key={childNode.key}
          node={childNode}
          level={level + 1}
          selectedThreadId={selectedThreadId}
          onSelectThread={onSelectThread}
        />
      ))}
    </Fragment>
  );
}

/** Resolves the preferred human-readable label for a thread or agent. */
export function resolveThreadLabel(thread: OpenCodexThread): string {
  return thread.agentNickname
    ?? thread.subAgentSource?.agentNickname
    ?? thread.agentRole
    ?? thread.title;
}

/** Maps known App Server and collaboration statuses to translated labels. */
export function translateAgentStatus(
  status: string,
  translate: (key: string) => string
): string {
  const knownStatuses = new Set([
    "active",
    "completed",
    "errored",
    "idle",
    "interrupted",
    "notFound",
    "notLoaded",
    "pendingInit",
    "running",
    "shutdown",
    "systemError",
    "unknown"
  ]);

  return knownStatuses.has(status)
    ? translate(`sidebar.subAgentStatus.${status}`)
    : status;
}

/** Resolves a compact semantic color for a runtime status dot. */
function resolveStatusColor(status: string): string {
  if (status === "active" || status === "running") {
    return "success.main";
  }

  if (status === "errored" || status === "systemError" || status === "notFound") {
    return "error.main";
  }

  if (status === "interrupted") {
    return "warning.main";
  }

  return "text.disabled";
}
