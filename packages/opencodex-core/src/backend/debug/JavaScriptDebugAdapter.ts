import { requireSingleBrowserTarget } from "./browserTarget.js";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { DebugConfiguration, DebugCapabilities, DebugBreakpoint } from "@open-codex-ui/opencodex-protocol";
import { DebugAdapterProcess, type DebugAdapterRuntime } from "./DebugAdapterProcess.js";
import { DapConnection, type DapEvent } from "./DapConnection.js";
import { javascriptLaunchArguments } from "./javascriptConfiguration.js";

/** js-debug's root launcher and mandatory target channel form one user-visible session. */
export class JavaScriptDebugAdapter {
  /** Owns the standalone server process. */
  private readonly process = new DebugAdapterProcess();
  /** Launcher channel owns the target lifecycle. */
  private root: DapConnection | null = null;
  /** Secondary channel carries frames and execution commands. */
  private target: DapConnection | null = null;
  /** Ephemeral loopback server port shared by both channels. */
  private port = 0;
  /** Suppresses expected socket errors during cleanup. */
  private closing = false;
  /** Reserves the sole target before opening its socket. */
  private targetReserved = false;
  /** Disposable profile used only by launched browsers. */
  private profile: string | null = null;
  /** Local process explicitly launched by this session, for crash cleanup only. */
  private ownedPid: number | null = null;
  /** Attach mode must never acquire process termination rights. */
  private ownsTarget = false;
  /** Bounds launches that never produce a target channel. */
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  /** Adapter events are generic DAP data; ownership stays inside this integration. */
  onEvent: (event: DapEvent) => void = () => undefined;
  /** Unexpected transport/process failures are owned by the session. */
  onError: (error: Error) => void = () => undefined;
  /** Publishes target capabilities after the initialization handshake. */
  onReady: (capabilities: DebugCapabilities) => void = () => undefined;
  /** Called during initialization and when a target starts accepting breakpoints. */
  configure: (connection: DapConnection, isTarget: boolean) => Promise<void> = async () => undefined;

  /** Starts a single application using an adapter-provided secondary DAP connection. */
  async start(config: DebugConfiguration, runtime: DebugAdapterRuntime, breakpoints: DebugBreakpoint[] = []): Promise<void> {
    this.ownsTarget = config.request === "launch";
    if (config.target === "chrome" && config.request === "attach") {
      await requireSingleBrowserTarget(config.port!, config.urlFilter!);
    }
    if (this.closing) return;
    this.process.onExit = message => this.fail(new Error(message));
    const mappedBreakpoints = breakpoints.some(item => item.enabled && !/\.(c|m)?js$/i.test(item.path));
    const launch = javascriptLaunchArguments(config, "", mappedBreakpoints);
    if (config.target === "node" && config.request === "launch") {
      const metadata = await stat(String(launch.program));
      if (!metadata.isFile()) throw new Error("The Node.js program is not a file.");
    }
    this.port = await this.process.start(runtime);
    if (this.closing) return;
    this.profile = await mkdtemp(join(tmpdir(), "opencodex-debug-"));
    if (this.closing) { await rm(this.profile, { recursive: true, force: true }); return; }
    this.root = await DapConnection.connect(this.port);
    if (this.closing) { this.root.close(); return; }
    this.startupTimer = setTimeout(() => this.fail(new Error("No supported debug target connected.")), 25_000);
    await this.initialize(this.root, config.request, javascriptLaunchArguments(config, this.profile, mappedBreakpoints), false);
  }

  /** Returns the execution channel; launcher requests must never impersonate frames. */
  connection(): DapConnection {
    if (this.target === null || this.closing) throw new Error("Debug target is not connected.");
    return this.target;
  }

  /** Updates both the launcher's future-target template and the live target. */
  async updateBreakpoints(): Promise<void> {
    if (this.root !== null) await this.configure(this.root, false);
    if (this.target !== null) await this.configure(this.target, true);
  }

  /** Disconnects attached targets without terminating them; launched targets are owned. */
  async stop(terminateDebuggee: boolean): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    if (this.startupTimer !== null) clearTimeout(this.startupTimer);
    const connections = [this.target, this.root].filter((item): item is DapConnection => item !== null);
    const results = await Promise.allSettled(connections.map(connection =>
      connection.request("disconnect", { terminateDebuggee, restart: false }, 1800)));
    const failed = results.some(result => result.status === "rejected");
    for (const connection of connections) connection.close();
    await this.process.stop();
    // Never signal an attached process, even if its adapter crashes during detach.
    if (failed && terminateDebuggee && this.ownedPid !== null) {
      try { process.kill(this.ownedPid, "SIGKILL"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      this.ownedPid = null;
    }
    if (this.profile !== null) await rm(this.profile, { recursive: true, force: true, maxRetries: 3 });
  }

  /** Sends launch concurrently with configuration, as required by the DAP handshake. */
  private async initialize(connection: DapConnection, request: string, args: object, isTarget: boolean): Promise<void> {
    let initialized!: () => void;
    let disconnected!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => { initialized = resolve; disconnected = reject; });
    void ready.catch(() => undefined); // A failed initialize may close before the event wait starts.
    connection.onEvent = event => {
      if (event.event === "exited") this.ownedPid = null;
      if (this.closing) return;
      if (this.ownsTarget && event.event === "process" && event.body?.isLocalProcess === true &&
        typeof event.body.systemProcessId === "number" && event.body.systemProcessId > 0) {
        this.ownedPid = event.body.systemProcessId;
      }
      if (event.event === "initialized") initialized();
      else if (isTarget || event.event === "output") this.onEvent(event);
      else if (event.event === "terminated") this.onEvent(event);
    };
    connection.onClose = error => { disconnected(error); this.fail(error); };
    connection.onRequest = async (command, params) => {
      if (command !== "startDebugging") throw new Error(`Unsupported reverse request: ${command}. Interactive terminals are not supported.`);
      if (this.targetReserved || this.closing) {
        this.onEvent({ event: "output", body: { category: "stderr", output: "Additional debug target ignored: this version does not support workers or child processes.\n" } });
        throw new Error("Only one debug target is supported (no workers or child processes).");
      }
      this.targetReserved = true;
      void this.startTarget(params).catch(error => this.fail(error));
      return {};
    };
    const capabilities = await connection.request<DebugCapabilities>("initialize", {
      clientID: "opencodexui", clientName: "OpenCodexUI", adapterID: "javascript",
      linesStartAt1: true, columnsStartAt1: true, pathFormat: "path",
      supportsVariableType: true, supportsVariablePaging: true,
      supportsRunInTerminalRequest: false, supportsStartDebuggingRequest: true
    });
    const launch = connection.request(request, args);
    // Observe early launch failure while waiting for the initialized event.
    const failedLaunch = launch.then(() => new Promise<never>(() => undefined));
    await Promise.race([ready, failedLaunch]);
    await this.configure(connection, isTarget);
    if (capabilities.supportsConfigurationDoneRequest) await connection.request("configurationDone");
    await launch;
    if (isTarget && !this.closing) {
      if (this.startupTimer !== null) clearTimeout(this.startupTimer);
      this.onReady(capabilities);
    }
  }

  /** Accepts only the adapter's pending target identifier, not arbitrary reverse launch data. */
  private async startTarget(params: Record<string, unknown>): Promise<void> {
    const config = params.configuration as Record<string, unknown> | undefined;
    if (!config || typeof config.__pendingTargetId !== "string" || !["launch", "attach"].includes(String(params.request))) {
      throw new Error("Invalid js-debug target request.");
    }
    const connection = await DapConnection.connect(this.port);
    if (this.closing) { connection.close(); return; }
    this.target = connection;
    await this.initialize(connection, String(params.request), config, true);
  }

  /** Suppresses expected shutdown closure and forwards unexpected failures. */
  private fail(error: Error): void { if (!this.closing) this.onError(error); }
}
