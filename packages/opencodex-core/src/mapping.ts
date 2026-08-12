/**
 * Maps Codex app-server payloads into the OpenCodex UI data structures.
 */
export {
  mapThread,
  resolveDisplayTitle
} from "./mapping/threadMapping.js";
export {
  mapThreadMessages,
  mapTurnsToMessages,
  mapTurnsToOpenCodexTurns
} from "./mapping/turnMapping.js";

export { buildApprovalResponse, createApprovalRequest } from "./mapping/approvals.js";
export { createActivityFromNotification } from "./mapping/activity.js";
export {
  correlateCollaborationEvents,
  normalizeCollaborationResponseItem,
  normalizeCollaborationThreadItem,
  type CollaborationItemLifecycle,
  type CollaborationNormalizationContext
} from "./mapping/collaboration.js";
export {
  readMessagePhase,
  readNullableNumber,
  readObject,
  readString
} from "./mapping/primitives.js";
