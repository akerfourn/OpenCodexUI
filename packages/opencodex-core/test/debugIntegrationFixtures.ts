import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DebugConfiguration } from "@open-codex-ui/opencodex-protocol";
import { DebugSession } from "../src/backend/debug/DebugSession.js";

export const adapterRuntime = {
  entrypoint: fileURLToPath(new URL("../../../apps/electron-app/build/debug-adapter/1.140.0/js-debug/src/dapDebugServer.js", import.meta.url)),
  executable: process.env.DEBUG_ADAPTER_RUNTIME || process.execPath,
  electron: Boolean(process.env.DEBUG_ADAPTER_RUNTIME)
};

/** Isolated workspace with cleanup owned by each integration test. */
export async function debugFixture(overrides: Partial<DebugConfiguration> = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "opencodex-debug-test-"));
  const context = { sourceId: "local", projectId: "project", workspaceId: "workspace", workspacePath: directory };
  const configuration: DebugConfiguration = { id: "test", name: "Test", adapter: "javascript", context,
    target: "node", request: "launch", program: "main.js", runtime: process.execPath, ...overrides };
  const session = new DebugSession(configuration, () => undefined);
  return { directory, context, configuration, session, async dispose() {
    await session.finish(); await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } };
}

/** Starts a test-owned Inspector process; the debugger must leave it running on detach. */
export async function inspectorProcess(program: string): Promise<{ child: ChildProcess; port: number }> {
  const child = spawn(process.execPath, ["--inspect=127.0.0.1:0", program], { stdio: ["ignore", "ignore", "pipe"] });
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Inspector fixture startup timed out")), 5000);
      let output = "";
      child.stderr!.on("data", chunk => {
        output += String(chunk);
        const match = /ws:\/\/127\.0\.0\.1:(\d+)\//.exec(output);
        if (match) { clearTimeout(timer); resolve(Number(match[1])); }
      });
      child.once("error", error => { clearTimeout(timer); reject(error); });
      child.once("exit", () => { clearTimeout(timer); reject(new Error("Inspector fixture exited")); });
    });
    return { child, port };
  } catch (error) { child.kill(); throw error; }
}

/** Reaps only test-owned child processes. */
export async function stopFixtureProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>(resolve => { child.once("exit", () => resolve()); child.kill(); });
}
