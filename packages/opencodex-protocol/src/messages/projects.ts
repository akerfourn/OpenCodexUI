import type { OpenCodexLogType } from "./foundations.js";
import type { OpenCodexSourceColor } from "./sources.js";

/**
 * Cached project known by OpenCodexUI.
 */
export type OpenCodexProject = {
  id: string;
  sourceId: string | null;
  path: string;
  defaultName: string;
  displayName: string | null;
  isHidden: boolean;
  preferences: OpenCodexProjectPreferences;
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
  editedAt: string;
};

/**
 * OpenCodexUI-only group used to organize projects in the Home view.
 */
export type OpenCodexProjectGroup = {
  id: string;
  name: string;
  color: OpenCodexSourceColor;
  isCollapsed: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * One ordered node in the OpenCodexUI project tree.
 */
export type OpenCodexProjectTreeItem =
  | {
      type: "group";
      groupId: string;
      parentGroupId: string | null;
      sortOrder: number;
    }
  | {
      type: "project";
      projectId: string;
      parentGroupId: string | null;
      sortOrder: number;
    };

/**
 * Complete OpenCodexUI-only project tree snapshot.
 */
export type OpenCodexProjectGroupsSnapshot = {
  groups: OpenCodexProjectGroup[];
  items: OpenCodexProjectTreeItem[];
};

/**
 * Decision written to a Codex command authorization rule.
 */
export type OpenCodexCommandRuleDecision = "allow" | "prompt" | "forbidden";

/**
 * Project-local command rule managed by OpenCodexUI.
 */
export type OpenCodexProjectCommandRule = {
  id: string;
  projectId: string;
  name: string;
  pattern: string[];
  decision: OpenCodexCommandRuleDecision;
  justification: string | null;
  matchExamples: string[];
  notMatchExamples: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * State of the generated project-local rules file.
 */
export type OpenCodexProjectCommandRuleFileStatus =
  | "unsupported"
  | "notGenerated"
  | "synchronized"
  | "pending"
  | "external";

/**
 * Runtime state relevant to project rule changes.
 */
export type OpenCodexProjectCommandRuleRuntimeState =
  | "ready"
  | "restartPending"
  | "restarting"
  | "error";

/**
 * Synchronization and runtime status for one project's managed rules file.
 */
export type OpenCodexProjectCommandRuleStatus = {
  projectId: string;
  sourceId: string | null;
  filePath: string | null;
  fileStatus: OpenCodexProjectCommandRuleFileStatus;
  generatedHash: string | null;
  currentHash: string | null;
  desiredHash: string | null;
  isSupported: boolean;
  runtimeState: OpenCodexProjectCommandRuleRuntimeState;
  runtimeMessage: string | null;
};

/**
 * Complete project rule state returned to the UI.
 */
export type OpenCodexProjectCommandRulesSnapshot = {
  rules: OpenCodexProjectCommandRule[];
  status: OpenCodexProjectCommandRuleStatus;
};

/**
 * One rule match returned by `codex execpolicy check`.
 */
export type OpenCodexProjectCommandRuleMatch = {
  matchedPrefix: string[];
  decision: OpenCodexCommandRuleDecision;
  justification: string | null;
};

/**
 * Result of testing a command against the generated project rules file.
 */
export type OpenCodexProjectCommandRuleTestResult = {
  command: string[];
  decision: OpenCodexCommandRuleDecision | null;
  matchedRules: OpenCodexProjectCommandRuleMatch[];
  stdout: string;
  stderr: string;
  exitCode: number;
  parseError: string | null;
};

/**
 * Result of applying the generated project rules file.
 */
export type OpenCodexProjectCommandRuleApplyResult = {
  applied: boolean;
  requiresConfirmation: boolean;
  snapshot: OpenCodexProjectCommandRulesSnapshot;
};

/**
 * User-editable project preferences stored in SQLite.
 */
export type OpenCodexProjectPreferences = {
  git?: {
    referenceTagName?: string | null;
    /** Relative paths temporarily excluded from OpenCodexUI staging actions. */
    deferredPaths?: string[];
  };
  context?: {
    permissionsProfileId?: string | null;
    folders?: OpenCodexProjectContextFolder[];
    lastSyncedAt?: string | null;
  };
};

/**
 * External context folder configured for one project.
 */
export type OpenCodexProjectContextFolder = {
  id: string;
  path: string;
  label: string | null;
  enabled: boolean;
};

/**
 * File or directory search result for composer references.
 */
export type OpenCodexFileSearchResult = {
  root: string;
  path: string;
  relativePath: string;
  fileName: string;
  matchType: "file" | "directory";
};

/**
 * Skill search result for composer references.
 */
export type OpenCodexSkillSearchResult = {
  name: string;
  displayName: string;
  description: string;
  shortDescription: string | null;
  path: string;
  scope: string;
};

/**
 * Structured composer reference embedded in a turn request.
 */
export type OpenCodexComposerReference =
  | {
      type: "skill";
      name: string;
      path: string;
    };

/**
 * Persisted application log entry.
 */
export type OpenCodexLogEntry = {
  id: string;
  type: OpenCodexLogType;
  message: string;
  details: unknown;
  createdAt: string;
};

/**
 * Processing stage recorded by the per-chat Codex event trace.
 */
export type OpenCodexThreadEventLogStage =
  | "received"
  | "ui-emitted"
  | "client-requested";

/** Supported client requests retained by the per-chat Codex event trace. */
export type OpenCodexThreadEventLogRequestType =
  | "turn.start"
  | "turn.steer"
  | "thread.goal.get"
  | "thread.goal.set"
  | "thread.goal.clear";

/**
 * Scalar metadata value retained by the per-chat Codex event trace.
 */
export type OpenCodexThreadEventLogValue = string | number | boolean | null;

/**
 * Metadata-only event entry associated with one source and chat thread.
 */
export type OpenCodexThreadEventLogEntry = {
  id: string;
  sequence: number;
  stage: OpenCodexThreadEventLogStage;
  eventName: string;
  sourceId: string | null;
  threadId: string;
  turnId: string | null;
  itemId: string | null;
  occurredAt: string;
  lastOccurredAt: string;
  count: number;
  details: Record<string, OpenCodexThreadEventLogValue>;
};

/**
 * Bounded result returned when reading a per-chat Codex event trace.
 */
export type OpenCodexThreadEventLogPage = {
  entries: OpenCodexThreadEventLogEntry[];
  truncated: boolean;
};

/**
 * Paginated log result.
 */
export type OpenCodexLogPage = {
  logs: OpenCodexLogEntry[];
  hasMore: boolean;
};
