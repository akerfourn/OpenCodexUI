import type { CodexAppServerClient, CodexNotification } from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexLogEntry,
  OpenCodexProject,
  OpenCodexSettings,
  OpenCodexTurnDiagnostic,
  OpenCodexTurnDiagnosticRequestInput,
  OpenCodexThreadEventLogPage,
  OpenCodexThreadEventLogRequestType,
  OpenCodexThreadEventLogValue
} from "@open-codex-ui/opencodex-protocol";

/** Provides access to the mutable settings owned by the backend runtime. */
export interface RuntimeSettingsPort {
  /** Reads the current settings snapshot. */
  getSettings(): OpenCodexSettings;
  /** Replaces the current settings snapshot. */
  setSettings(settings: OpenCodexSettings): void;
}

/** Emits runtime events and exposes the runtime-owned thread event journal. */
export interface RuntimeEventPort {
  /** Emits one event to the host transport. */
  emit(event: OpenCodexEvent): void;
  /** Records one raw Codex notification in the thread event journal. */
  recordRawNotification(notification: CodexNotification, sourceId: string): void;
  /** Records one outgoing turn request in the thread event journal. */
  recordClientRequest(
    sourceId: string,
    threadId: string,
    requestType: OpenCodexThreadEventLogRequestType,
    turnId: string | null,
    details?: Record<string, OpenCodexThreadEventLogValue>
  ): void;
  /** Records the exact structured input of a developer-mode turn request. */
  recordTurnDiagnosticRequest?(
    sourceId: string,
    threadId: string,
    request: OpenCodexTurnDiagnosticRequestInput
  ): string | null;
  /** Completes a previously captured developer-mode turn request. */
  recordTurnDiagnosticResponse?(
    diagnosticId: string,
    turnId: string | null,
    errorMessage: string | null
  ): void;
  /** Reads a process-local diagnostic trace for one turn. */
  readTurnDiagnostic?(
    threadId: string,
    sourceId: string | null,
    turnId: string
  ): OpenCodexTurnDiagnostic | null;
  /** Reads the bounded event journal for one thread. */
  readThreadEventLog(
    threadId: string,
    sourceId: string | null,
    limit: number
  ): OpenCodexThreadEventLogPage;
}

/** Provides the client lifecycle operations needed by runtime services. */
export interface ClientPort {
  /** Returns an existing client or starts one for a source. */
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
  /** Looks up an already started client by source identifier. */
  getClient(sourceId: string): CodexAppServerClient | undefined;
  /** Stops and recreates a source client. */
  restartClient(sourceId: string): Promise<void>;
}

/** Provides best-effort persistence for application diagnostics. */
export interface ApplicationLogPort {
  /** Starts persisting an application log without propagating failures. */
  persistLog(
    type: OpenCodexLogEntry["type"],
    message: string,
    details: unknown
  ): void;
}

/** Provides source resolution and project-cache operations to runtime services. */
export interface ProjectSourcePort {
  /** Resolves a source, falling back to the configured default when needed. */
  resolveSource(sourceId: string | null): Promise<CachedSource>;
  /** Resolves a requested source and rejects when an explicit id is unavailable. */
  resolveRequestedSource(sourceId: string | null): Promise<CachedSource>;
  /** Caches project metadata for a source-aware operation. */
  cacheProject(
    projectPath: string | null,
    sourceId: string | null
  ): Promise<OpenCodexProject | null>;
  /** Reads the projects currently present in the cache. */
  readCachedProjects(): Promise<OpenCodexProject[]>;
}
