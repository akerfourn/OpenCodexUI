import type { OpenCodexFileContext } from "./files";

/** Persisted launch parameters. Relative paths belong to the captured workspace. */
export interface DebugConfiguration {
  id: string;
  name: string;
  adapter: "javascript";
  context: OpenCodexFileContext;
  target: "node" | "chrome";
  request: "launch" | "attach";
  program?: string;
  args?: string[];
  cwd?: string;
  runtime?: string;
  port?: number;
  url?: string;
  urlFilter?: string;
  webRoot?: string;
}

/** Workspace breakpoints are independent from adapter-assigned identifiers. */
export interface DebugBreakpoint {
  id: string;
  context: OpenCodexFileContext;
  path: string;
  line: number;
  enabled: boolean;
  condition?: string;
}

export interface DebugPreferences {
  configurations: DebugConfiguration[];
  breakpoints: DebugBreakpoint[];
  watches: string[];
}

export interface DebugSource { name?: string; path?: string; sourceReference?: number }
export interface DebugThread { id: number; name: string }
export interface DebugFrame { id: number; name: string; source?: DebugSource; line: number; column: number }
export interface DebugScope { name: string; variablesReference: number; expensive: boolean }
export interface DebugVariable {
  name: string;
  value: string;
  type?: string;
  variablesReference: number;
  indexedVariables?: number;
  namedVariables?: number;
}
export interface DebugCapabilities {
  supportsConfigurationDoneRequest?: boolean;
  supportsConditionalBreakpoints?: boolean;
  supportsEvaluateForHovers?: boolean;
  supportsTerminateRequest?: boolean;
}
export interface DebugBreakpointStatus {
  id: string;
  adapterId?: number;
  verified: boolean;
  line?: number;
  message?: string;
}
export interface DebugOutput {
  id: number;
  category: string;
  text: string;
  source?: DebugSource;
  line?: number;
  column?: number;
}

/** Epoch changes invalidate frame and variable references after execution resumes. */
export interface DebugSessionSnapshot {
  id: string;
  configuration: DebugConfiguration;
  state: "preparing" | "connecting" | "running" | "paused" | "stopping" | "terminated" | "failed";
  epoch: number;
  reason?: string;
  error?: string;
  threadId?: number;
  capabilities: DebugCapabilities;
  breakpoints: DebugBreakpointStatus[];
  output: DebugOutput[];
}

export interface DebugSnapshot {
  revision: number;
  preferences: DebugPreferences;
  session: DebugSessionSnapshot | null;
}

/** Every execution operation names its session; suspended queries also name their epoch. */
export type DebugAction =
  | { kind: "snapshot" }
  | { kind: "saveConfiguration"; configuration: DebugConfiguration }
  | { kind: "deleteConfiguration"; id: string }
  | { kind: "breakpoints"; context: OpenCodexFileContext; breakpoints: DebugBreakpoint[] }
  | { kind: "watches"; expressions: string[] }
  | { kind: "start"; configurationId: string }
  | { kind: "stop"; sessionId: string }
  | { kind: "clearConsole"; sessionId: string }
  | { kind: "control"; sessionId: string; command: "pause" | "continue" | "next" | "stepIn" | "stepOut"; threadId: number }
  | { kind: "threads"; sessionId: string; epoch: number }
  | { kind: "stack"; sessionId: string; epoch: number; threadId: number }
  | { kind: "scopes"; sessionId: string; epoch: number; frameId: number }
  | { kind: "variables"; sessionId: string; epoch: number; reference: number; start?: number; filter?: "indexed" | "named" }
  | { kind: "evaluate"; sessionId: string; epoch: number; expression: string; frameId: number; context: "watch" | "repl" }
  | { kind: "source"; sessionId: string; epoch: number; source: DebugSource };

export interface OpenCodexDebugRequest { type: "debug"; action: DebugAction }

/** Compares all filesystem dimensions, including a moved workspace's old path. */
export function sameDebugContext(left: OpenCodexFileContext, right: OpenCodexFileContext): boolean {
  return left.sourceId === right.sourceId && left.projectId === right.projectId &&
    left.workspaceId === right.workspaceId && left.workspacePath === right.workspacePath;
}

/** Ended snapshots remain inspectable but no longer own the application's session slot. */
export function isDebugActive(session: DebugSessionSnapshot | null | undefined): boolean {
  return session != null && session.state !== "terminated" && session.state !== "failed";
}
