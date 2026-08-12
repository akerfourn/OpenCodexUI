import type { OpenCodexCollaborationEvent } from "@open-codex-ui/opencodex-protocol";

/**
 * Collaboration event persisted after semantic App Server normalization.
 */
export type CachedCollaborationEvent = OpenCodexCollaborationEvent & {
  firstObservedAt: string;
  updatedAt: string;
};

/**
 * Source-aware filters used to read persisted collaboration events.
 */
export type CachedCollaborationEventQuery = {
  sourceId: string;
  threadId?: string;
  senderThreadId?: string;
  receiverThreadId?: string;
  rootThreadId?: string;
  limit?: number;
};
