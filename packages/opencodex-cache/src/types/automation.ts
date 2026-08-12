/**
 * Project-local command configured by the user.
 */
export type CachedProjectCommand = {
  id: string;
  projectId: string;
  name: string;
  command: string;
  allowParallel: boolean;
  persistLogs: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

/**
 * Input payload used to create a project command.
 */
export type CachedProjectCommandCreateInput = {
  projectId: string;
  name: string;
  command: string;
  allowParallel: boolean;
  persistLogs: boolean;
};

/**
 * Partial update payload for a project command.
 */
export type CachedProjectCommandUpdateInput = {
  name?: string;
  command?: string;
  allowParallel?: boolean;
  persistLogs?: boolean;
};

export type CachedCommandRuleDecision = "allow" | "prompt" | "forbidden";

/**
 * Project-local command authorization rule persisted by OpenCodexUI.
 */
export type CachedProjectCommandRule = {
  id: string;
  projectId: string;
  name: string;
  pattern: string[];
  decision: CachedCommandRuleDecision;
  justification: string | null;
  matchExamples: string[];
  notMatchExamples: string[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

/**
 * Input used to create a project command authorization rule.
 */
export type CachedProjectCommandRuleCreateInput = {
  projectId: string;
  name: string;
  pattern: string[];
  decision: CachedCommandRuleDecision;
  justification: string | null;
  matchExamples: string[];
  notMatchExamples: string[];
  enabled: boolean;
};

/**
 * Partial update applied to a project command authorization rule.
 */
export type CachedProjectCommandRuleUpdateInput = {
  name?: string;
  pattern?: string[];
  decision?: CachedCommandRuleDecision;
  justification?: string | null;
  matchExamples?: string[];
  notMatchExamples?: string[];
  enabled?: boolean;
};

/**
 * Persisted synchronization metadata for one generated rules file.
 */
export type CachedProjectCommandRuleFileState = {
  projectId: string;
  generatedHash: string | null;
  generatedPath: string | null;
  updatedAt: string;
};

/**
 * Persisted order payload for one project's command list.
 */
export type CachedProjectCommandReorderInput = {
  projectId: string;
  commandIds: string[];
};

export type CachedProjectTaskStatus = "todo" | "inProgress" | "toValidate" | "done";

/**
 * Project-local task stored only in the OpenCodexUI cache.
 */
export type CachedProjectTask = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: CachedProjectTaskStatus;
  createdAt: string;
  updatedAt: string;
};

/**
 * Input payload used to create a project-local task.
 */
export type CachedProjectTaskCreateInput = {
  projectId: string;
  title: string;
  description: string;
  status: CachedProjectTaskStatus;
};

/**
 * Partial update payload for a project-local task.
 */
export type CachedProjectTaskUpdateInput = {
  title?: string;
  description?: string;
  status?: CachedProjectTaskStatus;
};
