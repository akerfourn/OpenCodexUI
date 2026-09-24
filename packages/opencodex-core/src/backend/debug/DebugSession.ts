import type { DebugAdapter } from "./DebugAdapter.js";
import { randomUUID } from "node:crypto";
import type { DebugAction, DebugBreakpoint, DebugBreakpointStatus, DebugConfiguration,
  DebugSessionSnapshot, DebugSource, DebugOutput } from "@open-codex-ui/opencodex-protocol";
import { sameDebugContext } from "@open-codex-ui/opencodex-protocol";
import path from "node:path";
import { JavaScriptDebugAdapter } from "./JavaScriptDebugAdapter.js";
import type { DebugAdapterRuntime } from "./DebugAdapterProcess.js";
import type { DapConnection, DapEvent } from "./DapConnection.js";

/** Isolates adapter callbacks, execution references and bounded output for one session. */
export class DebugSession {
  /** Plain execution state copied at the transport boundary. */
  readonly snapshot: DebugSessionSnapshot;
  /** Target-specific DAP startup and connection ownership. */
  private readonly adapter: DebugAdapter;
  /** Latest requested breakpoints, independent of adapter confirmations. */
  private breakpoints: DebugBreakpoint[] = [];
  /** Remembers cleared sources so their old adapter breakpoints are removed. */
  private readonly configuredPaths = new Set<string>();
  /** Shared cleanup promise prevents concurrent termination paths. */
  private stopped: Promise<void> | null = null;
  /** Console entry IDs stay unique after clearing history. */
  private outputSequence = 0;
  /** Batches output bursts before emitting a new snapshot. */
  private outputTimer: ReturnType<typeof setTimeout> | null = null;
  /** Orders whole-file breakpoint updates sent to the adapter. */
  private breakpointQueue: Promise<void> = Promise.resolve();

  /** Captures an immutable launch configuration and a replaceable adapter for deterministic tests. */
  constructor(config: DebugConfiguration, private readonly changed: () => void,
    adapter: DebugAdapter = new JavaScriptDebugAdapter()) {
    this.adapter = adapter;
    this.snapshot = { id: randomUUID(), configuration: structuredClone(config), state: "preparing",
      epoch: 0, capabilities: {}, breakpoints: [], output: [] };
    adapter.configure = (connection, target) => this.configureBreakpoints(connection, target);
    adapter.onEvent = event => this.event(event);
    adapter.onError = error => { void this.finish(String(error)); };
    adapter.onReady = capabilities => {
      if (this.stopped !== null) return;
      this.snapshot.capabilities = capabilities;
      if (this.snapshot.state !== "paused") this.snapshot.state = "running";
      this.changed();
    };
  }

  /** Launches only after context validation; failure releases the session for another attempt. */
  async start(runtime: DebugAdapterRuntime, breakpoints: DebugBreakpoint[]): Promise<void> {
    if (this.stopped !== null) return;
    this.breakpoints = breakpoints;
    this.snapshot.state = "connecting";
    this.changed();
    try { await this.adapter.start(this.snapshot.configuration, runtime, breakpoints.filter(item =>
      sameDebugContext(item.context, this.snapshot.configuration.context))); }
    catch (error) { await this.finish(String(error)); }
  }

  /** Queues whole-file breakpoint replacement, including empty sets for removed sources. */
  async setBreakpoints(breakpoints: DebugBreakpoint[]): Promise<void> {
    this.breakpoints = structuredClone(breakpoints);
    this.breakpointQueue = this.breakpointQueue.catch(() => undefined).then(async () => {
      if (this.stopped === null) await this.adapter.updateBreakpoints();
    });
    await this.breakpointQueue;
  }

  /** Marks cleanup before awaiting I/O so disconnect callbacks cannot resurrect this session. */
  finish(error?: string): Promise<void> {
    if (this.stopped !== null) return this.stopped;
    this.snapshot.state = "stopping";
    this.snapshot.epoch++;
    this.snapshot.threadId = undefined;
    if (error) this.snapshot.error = error;
    this.stopped = this.cleanup(error);
    this.changed();
    return this.stopped;
  }

  /** Checks epoch both before and after suspension-dependent requests. */
  async query(action: Extract<DebugAction, { epoch: number }>): Promise<unknown> {
    this.requirePause(action.epoch);
    const connection = this.adapter.connection();
    let result: unknown;
    switch (action.kind) {
      case "threads": result = await connection.request("threads"); break;
      case "stack": result = await connection.request("stackTrace", { threadId: action.threadId, startFrame: 0, levels: 100 }); break;
      case "scopes": result = await connection.request("scopes", { frameId: action.frameId }); break;
      case "variables": result = await connection.request("variables", { variablesReference: action.reference,
        start: action.start ?? 0, count: 100, filter: action.filter }); break;
      case "evaluate":
        result = await connection.request("evaluate", { expression: action.expression.slice(0, 16384),
          frameId: action.frameId, context: action.context });
        if (action.context === "repl") {
          this.output({ category: "input", text: action.expression });
          this.output({ category: "result", text: String((result as { result: string }).result) });
        }
        break;
      case "source":
        result = await connection.request("source", { source: action.source,
          sourceReference: action.source.sourceReference ?? 0 });
        if (String((result as { content: string }).content).length > 2 * 1024 * 1024) {
          throw new Error("Debug source exceeds the 2 MiB editor limit.");
        }
        break;
    }
    this.requirePause(action.epoch);
    return result;
  }

  /** Executes only controls valid for the current target state. */
  async control(command: string, threadId: number): Promise<void> {
    const state = this.snapshot.state;
    if ((command === "pause" && state !== "running") || (command !== "pause" && state !== "paused")) {
      throw new Error("This debugger command is unavailable in the current state.");
    }
    await this.adapter.connection().request(command, { threadId, singleThread: false });
    // js-debug sends continued before replying; do not clear a newer stopped event here.
  }

  /** Clears retained console history without resetting unique entry identifiers. */
  clearConsole(): void { this.snapshot.output = []; this.changed(); }

  /** Resumes invalidate all references immediately, even when a response arrives later. */
  private event(event: DapEvent): void {
    if (this.stopped !== null) return;
    const body = event.body ?? {};
    if (event.event === "output" && body.category === "telemetry") return;
    if (event.event === "stopped") {
      this.snapshot.state = "paused";
      this.snapshot.epoch++;
      this.snapshot.threadId = body.threadId as number | undefined;
      this.snapshot.reason = String(body.description ?? body.reason ?? "Paused");
    } else if (event.event === "continued") {
      this.snapshot.state = "running";
      this.snapshot.epoch++;
    } else if (event.event === "thread") {
      if (body.reason === "started" && typeof body.threadId === "number") this.snapshot.threadId = body.threadId;
    } else if (event.event === "exited") {
      if (typeof body.exitCode === "number" && body.exitCode !== 0) {
        this.snapshot.error = `Debug target exited with code ${body.exitCode}. See the debug console.`;
      }
    } else if (event.event === "terminated") {
      void this.finish();
      return;
    } else if (event.event === "output") {
      this.output({ category: String(body.category ?? "console"), text: String(body.output ?? ""),
        source: body.source as DebugSource | undefined, line: body.line as number | undefined,
        column: body.column as number | undefined });
      return;
    } else if (event.event === "breakpoint") {
      const breakpoint = body.breakpoint as { id?: number; verified: boolean; line?: number; message?: string };
      const existing = this.snapshot.breakpoints.find(item => item.adapterId === breakpoint?.id);
      if (existing) Object.assign(existing, { verified: breakpoint.verified, line: breakpoint.line, message: breakpoint.message });
    } else if (event.event === "capabilities") {
      Object.assign(this.snapshot.capabilities, body.capabilities);
    } else return;
    this.changed();
  }

  /** Breakpoints are replaced per source; the backend owns path resolution and status mapping. */
  private async configureBreakpoints(connection: DapConnection, target: boolean): Promise<void> {
    const context = this.snapshot.configuration.context;
    const relevant = this.breakpoints.filter(item => sameDebugContext(item.context, context));
    for (const breakpoint of relevant) this.configuredPaths.add(breakpoint.path);
    const statuses: DebugBreakpointStatus[] = [];
    for (const file of this.configuredPaths) {
      const requested = relevant.filter(item => item.path === file && item.enabled);
      const response = await connection.request<{ breakpoints: Array<{
        id?: number; verified: boolean; line?: number; message?: string;
      }> }>("setBreakpoints", { source: { path: path.resolve(context.workspacePath, file) },
        breakpoints: requested.map(item => ({ line: item.line, condition: item.condition || undefined })) });
      requested.forEach((item, index) => {
        const status = response.breakpoints[index];
        statuses.push({ id: item.id, adapterId: status?.id, verified: status?.verified ?? false,
          line: status?.line, message: status?.message });
      });
    }
    if (target && this.stopped === null) { this.snapshot.breakpoints = statuses; this.changed(); }
  }

  /** Prevents retained UI references from being reused after continue or disconnection. */
  private requirePause(epoch: number): void {
    if (this.snapshot.state !== "paused" || this.snapshot.epoch !== epoch) {
      throw new Error("Debug execution context expired; select the current paused frame.");
    }
  }

  /** Bounds output bytes and entry count and batches transport publication. */
  private output(output: Omit<DebugOutput, "id">): void {
    this.snapshot.output.push({ ...output, text: output.text.slice(0, 4096), id: ++this.outputSequence });
    this.snapshot.output = this.snapshot.output.slice(-300);
    this.outputTimer ??= setTimeout(() => { this.outputTimer = null; this.changed(); }, 50);
  }

  /** Waits for cleanup before marking the global session slot reusable. */
  private async cleanup(error?: string): Promise<void> {
    try { await this.adapter.stop(this.snapshot.configuration.request === "launch"); }
    catch (cleanupError) { this.snapshot.error = `${error ?? ""}\n${String(cleanupError)}`; }
    finally {
      if (this.outputTimer !== null) clearTimeout(this.outputTimer);
      this.outputTimer = null;
      this.snapshot.state = this.snapshot.error ? "failed" : "terminated";
      this.snapshot.breakpoints = [];
      this.changed();
    }
  }
}
