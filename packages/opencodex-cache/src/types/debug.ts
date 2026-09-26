import type {
  DebugBreakpoint, DebugConfiguration, DebugPreferences, OpenCodexFileContext
} from "@open-codex-ui/opencodex-protocol";

/** Durable debugger data shared by the application's project and workspace views. */
export interface DebugRepository {
  /** Reads saved data, excluding all transient execution state. */
  read(): Promise<DebugPreferences>;
  /** Imports legacy JSON once, atomically with its completion marker. */
  importLegacy(preferences: DebugPreferences): Promise<void>;
  /** Inserts or updates one configuration by its stable identifier. */
  saveConfiguration(configuration: DebugConfiguration): Promise<void>;
  /** Removes one saved configuration without affecting a running session. */
  deleteConfiguration(id: string): Promise<void>;
  /** Replaces only the breakpoints belonging to the full filesystem context. */
  replaceBreakpoints(context: OpenCodexFileContext, breakpoints: DebugBreakpoint[]): Promise<void>;
  /** Replaces the application's ordered watch expressions. */
  replaceWatches(expressions: string[]): Promise<void>;
}
