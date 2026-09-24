import { spawn, type ChildProcess } from "node:child_process";
import { access } from "node:fs/promises";

/** Host supplies a bundled adapter and a Node-compatible executable (Electron run-as-node). */
export interface DebugAdapterRuntime { entrypoint: string; executable: string; electron?: boolean }

/** Owns only the adapter process, never an attached debuggee. */
export class DebugAdapterProcess {
  /** Spawned adapter handle; target ownership belongs to DAP. */
  private child: ChildProcess | null = null;
  /** Distinguishes expected shutdown from adapter crashes. */
  private stopping = false;
  /** Reports crashes after the server has started. */
  onExit: (message: string) => void = () => undefined;

  /** Launches the pinned adapter on an ephemeral loopback port. */
  async start(runtime: DebugAdapterRuntime): Promise<number> {
    await access(runtime.entrypoint);
    if (this.stopping) throw new Error("Debug launch cancelled.");
    const env = { ...process.env };
    if (runtime.electron) env.ELECTRON_RUN_AS_NODE = "1";
    delete env.NODE_OPTIONS;
    const child = spawn(runtime.executable, [runtime.entrypoint, "0", "127.0.0.1"], {
      env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true
    });
    this.child = child;
    return await new Promise<number>((resolve, reject) => {
      let output = "";
      let ready = false;
      const timer = setTimeout(() => {
        reject(new Error(`Debugger adapter startup timed out. ${output}`));
        void this.stop();
      }, 10_000);
      child.stdout!.on("data", chunk => {
        output = (output + String(chunk)).slice(-8192);
        const match = /Debug server listening at .*:(\d+)/.exec(output);
        if (match !== null && !ready) { ready = true; clearTimeout(timer); resolve(Number(match[1])); }
      });
      child.stderr!.on("data", chunk => { output = (output + String(chunk)).slice(-8192); });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", (code, signal) => {
        clearTimeout(timer);
        const message = `Debugger adapter exited (${code ?? signal}). ${output}`;
        if (!ready) reject(new Error(message));
        if (!this.stopping) this.onExit(message);
      });
    });
  }

  /** Reaps the adapter after DAP disconnect, with a bounded force-kill fallback. */
  async stop(): Promise<void> {
    this.stopping = true;
    const child = this.child;
    if (child === null || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); resolve(); }, 1000);
      child.once("exit", () => { clearTimeout(timer); resolve(); });
      child.kill();
    });
  }
}
