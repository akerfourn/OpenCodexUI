import type { DebugCapabilities, DebugConfiguration, DebugBreakpoint } from "@open-codex-ui/opencodex-protocol";
import type { DapConnection, DapEvent } from "./DapConnection.js";
import type { DebugAdapterRuntime } from "./DebugAdapterProcess.js";

/** Adapter-specific startup and ownership are separate from generic execution state. */
export interface DebugAdapter {
  onEvent(event: DapEvent): void;
  onError(error: Error): void;
  onReady(capabilities: DebugCapabilities): void;
  configure(connection: DapConnection, isTarget: boolean): Promise<void>;
  start(config: DebugConfiguration, runtime: DebugAdapterRuntime, breakpoints?: DebugBreakpoint[]): Promise<void>;
  connection(): DapConnection;
  updateBreakpoints(): Promise<void>;
  stop(terminateDebuggee: boolean): Promise<void>;
}
