import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

/** Request used to open one sub-agent hierarchy and optionally select a descendant. */
export type SubAgentDialogRequest = {
  rootThread: OpenCodexThread;
  selectedThreadId: string | null;
};

/** Opens the sub-agent dialog for a root and an optional descendant. */
export type OpenSubAgentDialog = (
  rootThread: OpenCodexThread,
  selectedThreadId?: string | null
) => void;
