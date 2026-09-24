import { debugPayload } from "./debugPayload";
import { makeAutoObservable, runInAction } from "mobx";
import { isDebugActive, sameDebugContext } from "@open-codex-ui/opencodex-protocol";
import type { DebugAction, DebugSnapshot, DebugFrame, DebugScope, DebugThread, DebugVariable,
  DebugBreakpoint, DebugConfiguration, DebugSource, OpenCodexFileContext } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { FileDocument } from "../files/FileDocument";
import { bindDebugDocument, openDebugSource, workspaceRelativeSource } from "./debugDocuments";

/** Application-lifetime debug state, independent of panel and project selection. */
export class DebugStore {
  /** Last accepted backend state; persists across panel unmounts. */
  snapshot: DebugSnapshot = { revision: -1, preferences: { configurations: [], breakpoints: [], watches: [] }, session: null };
  /** Request failure shown in the Debug panel. */
  error: string | null = null;
  /** Guards repeated start clicks until the backend answers. */
  busy = false;
  /** Prevents duplicate stepping requests before a continued event is received. */
  controlPending = false;
  /** Threads reported by the current paused target. */
  threads: DebugThread[] = [];
  /** Bounded call stack for the current pause. */
  frames: DebugFrame[] = [];
  /** Lazy variable roots belonging to the selected frame. */
  scopes: DebugScope[] = [];
  /** Explicit evaluation context; cleared when execution resumes. */
  selectedFrame: DebugFrame | null = null;
  /** Results keyed by their persisted expressions. */
  watches: Record<string, string> = {};
  /** Position references a specific document, not the currently selected workspace. */
  execution: { documentId: string; line: number } | null = null;
  /** Rejects responses from an earlier selection or execution epoch. */
  private frameGeneration = 0;
  /** Session whose suspended context is currently loaded. */
  private selectionSession = "";
  /** Avoids reloading frames for console-only snapshot updates. */
  private selectionEpoch = -1;
  /** Serializes margin toggles so rapid clicks use the last confirmed breakpoint set. */
  private breakpointQueue: Promise<void> = Promise.resolve();

  /** Root requests supply the same transport used by other modules. */
  constructor(readonly root: RootStore) {
    makeAutoObservable<this, "breakpointQueue">(this, { root: false, breakpointQueue: false }, { autoBind: true });
  }

  /** A single active slot is visible across all project panels. */
  get active(): boolean { return isDebugActive(this.snapshot.session); }

  /** Refreshes backend-owned state when the panel is first opened or the renderer reconnects. */
  async load(): Promise<void> { await this.run({ kind: "snapshot" }); }

  /** Rejects late snapshots and refreshes suspended data only when its epoch changes. */
  apply(snapshot: DebugSnapshot): void {
    if (snapshot.revision < this.snapshot.revision) return;
    this.snapshot = snapshot;
    const session = snapshot.session;
    const identity = session?.id ?? "";
    const epoch = session?.epoch ?? -1;
    if (identity === this.selectionSession && epoch === this.selectionEpoch) return;
    this.selectionSession = identity;
    this.selectionEpoch = epoch;
    this.frameGeneration++;
    this.frames = []; this.scopes = []; this.threads = [];
    this.selectedFrame = null; this.watches = {}; this.execution = null;
    if (session?.state === "paused") void this.refreshPause();
  }

  /** Serializes plain DTOs and retains failures inside the Debug panel. */
  async run(action: DebugAction): Promise<boolean> {
    this.error = null;
    try {
      const snapshot = await this.root.request<DebugSnapshot>({ type: "debug", action: debugPayload(action) });
      runInAction(() => this.apply(snapshot));
      return true;
    } catch (error) { runInAction(() => { this.error = String(error); }); return false; }
  }

  /** Prevents repeated clicks while waiting for start or disconnect acknowledgment. */
  async start(configurationId: string): Promise<void> {
    if (this.busy || this.active) return;
    this.busy = true;
    try { await this.run({ kind: "start", configurationId }); }
    finally { runInAction(() => { this.busy = false; }); }
  }

  /** Uses backend-captured ownership to choose termination versus detachment. */
  async stop(): Promise<void> {
    const session = this.snapshot.session;
    if (session === null || this.busy && session.state === "stopping") return;
    await this.run({ kind: "stop", sessionId: session.id });
  }

  /** Resolves the selected execution thread for state-appropriate stepping. */
  async control(command: Extract<DebugAction, { kind: "control" }>["command"]): Promise<void> {
    const session = this.snapshot.session;
    if (!session || this.controlPending) return;
    this.controlPending = true;
    try {
      await this.run({ kind: "control", sessionId: session.id, command,
        threadId: session.threadId ?? this.threads[0]?.id ?? 1 });
    } finally { runInAction(() => { this.controlPending = false; }); }
  }

  /** Reads frame-local data with a generation guard against rapid selection and continue. */
  async selectFrame(frame: DebugFrame): Promise<void> {
    const generation = ++this.frameGeneration;
    this.selectedFrame = frame; this.scopes = []; this.watches = {}; this.execution = null;
    try {
      const response = await this.query<{ scopes: DebugScope[] }>({ kind: "scopes", frameId: frame.id });
      if (generation !== this.frameGeneration) return;
      runInAction(() => { this.scopes = response.scopes.slice(0, 50); });
      await Promise.all([this.refreshWatches(generation), this.openSource(frame.source, frame.line, frame.column, generation)]);
    } catch (error) { if (generation === this.frameGeneration) runInAction(() => { this.error = String(error); }); }
  }

  /** Allows console/stack navigation without ever reading host paths in the renderer. */
  async openSource(source: DebugSource | undefined, line = 1, column = 1, generation = this.frameGeneration, markExecution = true): Promise<void> {
    if (!source) return;
    try {
      const session = this.snapshot.session;
      if (session === null) return;
      const response = await this.query<{ content: string }>({ kind: "source", source });
      if (generation !== this.frameGeneration) return;
      await openDebugSource(this, session, source, response.content, line, column,
        () => generation === this.frameGeneration, markExecution);
    } catch (error) { if (generation === this.frameGeneration) runInAction(() => { this.error = String(error); }); }
  }

  /** Console navigation must not move the selected frame's execution marker. */
  async openConsoleSource(source: DebugSource, line = 1, column = 1): Promise<void> {
    const session = this.snapshot.session;
    if (session === null) return;
    if (session.state === "paused") {
      await this.openSource(source, line, column, this.frameGeneration, false);
      return;
    }
    const context = session.configuration.context;
    const project = this.root.projectsStore.projectStoresById.get(context.projectId);
    if (!project || project.files.isDisposed) return;
    const prefix = `virtual:debug:${session.id}:${source.sourceReference ?? 0}:${source.path ?? source.name}:`;
    const previous = [...project.files.documents.values()].filter(item => item.id.startsWith(prefix)).at(-1);
    if (previous) {
      previous.position = { line, column };
      project.files.show(previous.id);
      return;
    }
    const relative = workspaceRelativeSource(context.workspacePath, source.path ?? "");
    if (relative !== null) {
      await project.files.open({ ...context, path: relative }, context.workspacePath, { line, column }, { origin: "link" });
    } else this.error = "This generated source is only available while the debugger is paused.";
  }

  /** UI components request bounded children only when users expand an object. */
  async variables(reference: number, start = 0, filter?: "indexed" | "named"): Promise<DebugVariable[]> {
    const result = await this.query<{ variables: DebugVariable[] }>({ kind: "variables", reference, start, filter });
    return result.variables.slice(0, 100);
  }

  /** Console expressions execute only in the explicitly selected suspended frame. */
  async evaluate(expression: string): Promise<boolean> {
    if (this.selectedFrame === null) return false;
    try { await this.query({ kind: "evaluate", frameId: this.selectedFrame.id, expression, context: "repl" }); return true; }
    catch (error) { runInAction(() => { this.error = String(error); }); return false; }
  }

  /** Persists expressions and immediately refreshes their current values when paused. */
  async setWatches(expressions: string[]): Promise<void> {
    if (await this.run({ kind: "watches", expressions })) await this.refreshWatches(this.frameGeneration);
  }

  /** Applies workspace-scoped full replacement, leaving other worktrees untouched. */
  async setBreakpoints(context: OpenCodexFileContext, breakpoints: DebugBreakpoint[]): Promise<void> {
    await this.run({ kind: "breakpoints", context, breakpoints });
  }

  /** Adds/removes a margin breakpoint without sending observable objects across IPC. */
  async toggleBreakpoint(context: OpenCodexFileContext, path: string, line: number): Promise<void> {
    const operation = this.breakpointQueue.then(async () => {
      const list = this.snapshot.preferences.breakpoints.filter(item => sameDebugContext(item.context, context));
      const existing = list.find(item => item.path === path && item.line === line);
      if (existing) await this.setBreakpoints(context, list.filter(item => item.id !== existing.id));
      else await this.setBreakpoints(context, [...list, { id: crypto.randomUUID(), context, path, line, enabled: true }]);
    });
    this.breakpointQueue = operation.catch(error => { runInAction(() => { this.error = String(error); }); });
    await this.breakpointQueue;
  }

  /** Adds viewer-neutral gutter interactions to physical or adapter-provided sources. */
  bindDocument(document: FileDocument, context: OpenCodexFileContext | null = document.target, path = document.target?.path): void {
    bindDebugDocument(this, document, context, path);
  }

  /** Saves configuration without automatically launching it. */
  async saveConfiguration(configuration: DebugConfiguration): Promise<boolean> {
    return await this.run({ kind: "saveConfiguration", configuration });
  }

  /** Captures suspended references once and rejects stale responses after resume. */
  private async query<T>(action: object): Promise<T> {
    const session = this.snapshot.session;
    if (session?.state !== "paused") throw new Error("The debugger is not paused.");
    const result = await this.root.request<T>({ type: "debug", action: debugPayload({ ...action,
      sessionId: session.id, epoch: session.epoch } as DebugAction) });
    if (this.snapshot.session?.id !== session.id || this.snapshot.session.epoch !== session.epoch ||
      this.snapshot.session.state !== "paused") throw new Error("Debug context expired.");
    return result;
  }

  /** Loads a bounded stack and chooses a frame only for the still-current pause. */
  private async refreshPause(): Promise<void> {
    const generation = this.frameGeneration;
    try {
      const threads = await this.query<{ threads: DebugThread[] }>({ kind: "threads" });
      if (generation !== this.frameGeneration) return;
      runInAction(() => { this.threads = threads.threads; });
      const threadId = this.snapshot.session?.threadId ?? threads.threads[0]?.id;
      if (threadId === undefined) return;
      const stack = await this.query<{ stackFrames: DebugFrame[] }>({ kind: "stack", threadId });
      if (generation !== this.frameGeneration) return;
      runInAction(() => { this.frames = stack.stackFrames.slice(0, 100); });
      if (this.frames[0]) await this.selectFrame(this.frames[0]);
    } catch (error) { if (generation === this.frameGeneration) runInAction(() => { this.error = String(error); }); }
  }

  /** Evaluates independent watch expressions without allowing old frames to replace new results. */
  private async refreshWatches(generation: number): Promise<void> {
    const frame = this.selectedFrame;
    if (frame === null) return;
    for (const expression of this.snapshot.preferences.watches) {
      let value: string;
      try {
        const response = await this.query<{ result: string }>({ kind: "evaluate", expression,
          frameId: frame.id, context: "watch" });
        value = response.result.slice(0, 4096);
      } catch (error) { value = String(error); }
      if (generation !== this.frameGeneration) return;
      runInAction(() => { this.watches[expression] = value; });
    }
  }
}
