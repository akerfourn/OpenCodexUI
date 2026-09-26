import path from "node:path";
import type { DebugRepository } from "@open-codex-ui/opencodex-cache";
import { isDebugActive, sameDebugContext } from "@open-codex-ui/opencodex-protocol";
import type { DebugAction, DebugSnapshot, DebugPreferences, OpenCodexFileContext,
  OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { DebugSession } from "./DebugSession.js";
import type { DebugAdapterRuntime } from "./DebugAdapterProcess.js";
import { validateDebugConfiguration } from "./javascriptConfiguration.js";

interface DebugSettings {
  get(): OpenCodexSettings;
  update(patch: Partial<OpenCodexSettings>): Promise<OpenCodexSettings>;
}

/** Application-owned session slot with explicit identity on every execution operation. */
export class DebugService {
  /** Current or most recently ended session, retained for diagnostics. */
  private session: DebugSession | null = null;
  /** Orders snapshots even when request replies race with events. */
  private revision = 0;
  /** Serializes preferences read-modify-write operations. */
  private mutations: Promise<unknown> = Promise.resolve();
  /** Prevents new commands once application cleanup starts. */
  private disposed = false;
  /** Last committed database contents, used for synchronous session snapshots. */
  private preferences: DebugPreferences = { configurations: [], breakpoints: [], watches: [] };
  /** Shares initialization across bootstrap and early debug requests. */
  private initialization: Promise<void> | null = null;
  /** True only after the database has loaded and legacy JSON cleanup succeeded. */
  private initialized = false;

  /** Receives source validation and host runtime; core never interprets remote paths locally. */
  constructor(private readonly repository: DebugRepository | null,
    private readonly validateContext: (context: OpenCodexFileContext) => Promise<void>,
    private readonly emit: (snapshot: DebugSnapshot) => void,
    private readonly runtime?: DebugAdapterRuntime,
    private readonly legacySettings?: DebugSettings) {}

  /** Exposes detached plain DTOs, never the mutable session implementation. */
  snapshot(): DebugSnapshot {
    return structuredClone({ revision: this.revision, preferences: this.preferences,
      session: this.session?.snapshot ?? null });
  }

  /** Loads persisted data once; a failed migration remains retryable without dropping the JSON. */
  async initialize(): Promise<void> {
    if (this.initialized || this.repository === null) return;
    this.initialization ??= this.loadPreferences();
    try {
      await this.initialization;
    } finally {
      this.initialization = null;
    }
  }

  /** Removes legacy settings only after the database import and read both succeed. */
  private async loadPreferences(): Promise<void> {
    const repository = this.requireRepository();
    const legacy = this.legacySettings?.get().debug;
    if (legacy !== undefined) await repository.importLegacy(legacy);
    const preferences = await repository.read();
    if (legacy !== undefined) await this.legacySettings!.update({ debug: undefined });
    this.preferences = preferences;
    this.initialized = true;
  }

  /** Rejects persistence explicitly if the host could not open its database. */
  private requireRepository(): DebugRepository {
    if (this.repository === null) throw new Error("Debug storage is unavailable. Check the application database.");
    return this.repository;
  }

  /** Routes commands without resolving any implicit active source or workspace. */
  async execute(action: DebugAction): Promise<unknown> {
    if (!this.initialized) await this.initialize();
    if (this.disposed) throw new Error("Debugger is shutting down.");
    if (action.kind === "snapshot") return this.snapshot();
    if (["saveConfiguration", "deleteConfiguration", "breakpoints", "watches"].includes(action.kind)) {
      const mutation = this.mutations.then(() => this.persist(action));
      this.mutations = mutation.catch(() => undefined);
      await mutation;
      return this.snapshot();
    }
    if (action.kind === "start") {
      this.requireRepository();
      if (isDebugActive(this.session?.snapshot)) throw new Error("A debug session is already active.");
      if (!this.runtime) throw new Error("The bundled debugger adapter is unavailable.");
      const config = this.preferences.configurations.find(item => item.id === action.configurationId);
      if (!config) throw new Error("Debug configuration no longer exists.");
      validateDebugConfiguration(config);
      const session = new DebugSession(config, () => { if (this.session === session) this.publish(); });
      this.session = session; // Reserve before the first asynchronous operation.
      this.publish();
      try {
        await this.validateContext(config.context);
        await session.start(this.runtime, this.preferences.breakpoints);
      } catch (error) { await session.finish(String(error)); }
      return this.snapshot();
    }
    if (!("sessionId" in action) || this.session?.snapshot.id !== action.sessionId) {
      throw new Error("Debug session expired.");
    }
    if (action.kind === "stop") await this.session.finish();
    else if (action.kind === "clearConsole") this.session.clearConsole();
    else if (action.kind === "control") await this.session.control(action.command, action.threadId);
    else if ("epoch" in action) return await this.session.query(action);
    return this.snapshot();
  }

  /** Native application shutdown terminates launches and only detaches from attached targets. */
  async dispose(): Promise<void> {
    this.disposed = true;
    await this.mutations;
    await this.session?.finish();
  }

  /** Validates ownership and writes only the affected records before publishing new state. */
  private async persist(action: DebugAction): Promise<void> {
    const repository = this.requireRepository();
    const preferences = structuredClone(this.preferences);
    if (action.kind === "saveConfiguration") {
      validateDebugConfiguration(action.configuration);
      await this.validateContext(action.configuration.context);
      preferences.configurations = preferences.configurations.filter(item => item.id !== action.configuration.id);
      preferences.configurations.push(structuredClone(action.configuration));
      await repository.saveConfiguration(action.configuration);
    } else if (action.kind === "deleteConfiguration") {
      preferences.configurations = preferences.configurations.filter(item => item.id !== action.id);
      await repository.deleteConfiguration(action.id);
    } else if (action.kind === "breakpoints") {
      await this.validateContext(action.context);
      if (action.breakpoints.length > 500) throw new Error("At most 500 breakpoints per workspace are supported.");
      for (const item of action.breakpoints) {
        if (!sameDebugContext(item.context, action.context) || !item.id || !item.path ||
          path.isAbsolute(item.path) || item.path.split(/[\\/]/).includes("..") ||
          !Number.isInteger(item.line) || item.line < 1) throw new Error("Invalid workspace breakpoint.");
      }
      preferences.breakpoints = preferences.breakpoints.filter(item => !sameDebugContext(item.context, action.context));
      preferences.breakpoints.push(...structuredClone(action.breakpoints));
      await repository.replaceBreakpoints(action.context, action.breakpoints);
    } else if (action.kind === "watches") {
      preferences.watches = [...new Set(action.expressions.map(item => item.trim()).filter(Boolean))].slice(0, 50);
      await repository.replaceWatches(preferences.watches);
    } else throw new Error("Invalid debug settings operation.");
    this.preferences = preferences;
    this.publish();
    if (action.kind === "breakpoints" && isDebugActive(this.session?.snapshot)) {
      await this.session!.setBreakpoints(preferences.breakpoints);
    }
  }

  /** Monotonic revisions reject snapshots delivered after newer session events. */
  private publish(): void { this.revision++; this.emit(this.snapshot()); }
}
