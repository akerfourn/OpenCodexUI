import path from "node:path";
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

  /** Receives source validation and host runtime; core never interprets remote paths locally. */
  constructor(private readonly settings: DebugSettings,
    private readonly validateContext: (context: OpenCodexFileContext) => Promise<void>,
    private readonly emit: (snapshot: DebugSnapshot) => void,
    private readonly runtime?: DebugAdapterRuntime) {}

  /** Exposes detached plain DTOs, never the mutable session implementation. */
  snapshot(): DebugSnapshot {
    return structuredClone({ revision: this.revision, preferences: this.preferences,
      session: this.session?.snapshot ?? null });
  }

  /** Existing settings need no migration: absent debugger preferences mean an empty catalogue. */
  private get preferences(): DebugPreferences {
    return this.settings.get().debug ?? { configurations: [], breakpoints: [], watches: [] };
  }

  /** Routes commands without resolving any implicit active source or workspace. */
  async execute(action: DebugAction): Promise<unknown> {
    if (this.disposed) throw new Error("Debugger is shutting down.");
    if (action.kind === "snapshot") return this.snapshot();
    if (["saveConfiguration", "deleteConfiguration", "breakpoints", "watches"].includes(action.kind)) {
      const mutation = this.mutations.then(() => this.persist(action));
      this.mutations = mutation.catch(() => undefined);
      await mutation;
      return this.snapshot();
    }
    if (action.kind === "start") {
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
    await this.session?.finish();
  }

  /** Serializes read-modify-write settings changes and validates breakpoint ownership. */
  private async persist(action: DebugAction): Promise<void> {
    const preferences = structuredClone(this.preferences);
    if (action.kind === "saveConfiguration") {
      validateDebugConfiguration(action.configuration);
      await this.validateContext(action.configuration.context);
      preferences.configurations = preferences.configurations.filter(item => item.id !== action.configuration.id);
      preferences.configurations.push(structuredClone(action.configuration));
    } else if (action.kind === "deleteConfiguration") {
      preferences.configurations = preferences.configurations.filter(item => item.id !== action.id);
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
    } else if (action.kind === "watches") {
      preferences.watches = [...new Set(action.expressions.map(item => item.trim()).filter(Boolean))].slice(0, 50);
    } else throw new Error("Invalid debug settings operation.");
    await this.settings.update({ debug: preferences });
    this.publish();
    if (action.kind === "breakpoints" && isDebugActive(this.session?.snapshot)) {
      await this.session!.setBreakpoints(preferences.breakpoints);
    }
  }

  /** Monotonic revisions reject snapshots delivered after newer session events. */
  private publish(): void { this.revision++; this.emit(this.snapshot()); }
}
