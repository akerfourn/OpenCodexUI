/**
 * User-configured project command definition.
 */
export type OpenCodexProjectCommand = {
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
 * Lifecycle status for one project command run.
 */
export type OpenCodexProjectCommandRunStatus = "running" | "exited" | "failed" | "killed";

/**
 * Process output stream name for project command logs.
 */
export type OpenCodexProjectCommandOutputStream = "stdout" | "stderr";

/**
 * Live or completed execution of one project command.
 */
export type OpenCodexProjectCommandRun = {
  id: string;
  projectId: string;
  commandId: string;
  processHandle: string;
  command: string;
  status: OpenCodexProjectCommandRunStatus;
  startedAt: string;
  exitedAt: string | null;
  exitCode: number | null;
  logPath: string | null;
};

/**
 * Workflow status for local project tasks.
 */
export type OpenCodexProjectTaskStatus = "todo" | "inProgress" | "toValidate" | "done";

/**
 * Local task stored for one project.
 */
export type OpenCodexProjectTask = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  status: OpenCodexProjectTaskStatus;
  createdAt: string;
  updatedAt: string;
};
