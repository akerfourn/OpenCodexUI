import { describe, test, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DebugSession } from "../src/backend/debug/DebugSession.js";
import type { DebugConfiguration, DebugFrame, DebugScope, DebugVariable } from "@open-codex-ui/opencodex-protocol";

const entrypoint = fileURLToPath(new URL("../../../apps/electron-app/build/debug-adapter/1.140.0/js-debug/src/dapDebugServer.js", import.meta.url));

/** Real adapter smoke tests are opt-in; they start only small local test programs. */
describe.runIf(process.env.DEBUG_ADAPTER_INTEGRATION === "1")("bundled js-debug", () => {
  test("launches Node, confirms a breakpoint, reads variables and cleans up", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "opencodex-debug-test-"));
    await writeFile(path.join(directory, "main.js"), "const answer = 42;\nconsole.log(answer);\nsetInterval(() => {}, 1000);\n");
    const context = { sourceId: "local", projectId: "project", workspaceId: "workspace", workspacePath: directory };
    const config: DebugConfiguration = { id: "node", name: "Node", adapter: "javascript", context,
      target: "node", request: "launch", program: "main.js", runtime: process.execPath };
    const session = new DebugSession(config, () => undefined);
    let targetPid = 0;
    try {
      await session.start({ entrypoint, executable: process.execPath }, [
        { id: "bp", context, path: "main.js", line: 2, enabled: true }
      ]);
      expect(session.snapshot.error).toBeUndefined();
      await expect.poll(() => session.snapshot.state, { timeout: 15000 }).toBe("paused");
      expect(session.snapshot.error).toBeUndefined();
      await expect.poll(() => session.snapshot.breakpoints.find(item => item.id === "bp")?.verified).toBe(true);
      const identity = { sessionId: session.snapshot.id, epoch: session.snapshot.epoch };
      const stack = await session.query({ kind: "stack", ...identity, threadId: session.snapshot.threadId! }) as { stackFrames: DebugFrame[] };
      expect(stack.stackFrames[0].line).toBe(2);
      const evaluated = await session.query({ kind: "evaluate", ...identity, frameId: stack.stackFrames[0].id,
        expression: "process.pid", context: "watch" }) as { result: string };
      targetPid = Number(evaluated.result);
      expect(targetPid).toBeGreaterThan(0);
      const scopes = await session.query({ kind: "scopes", ...identity, frameId: stack.stackFrames[0].id }) as { scopes: DebugScope[] };
      const variables = await session.query({ kind: "variables", ...identity, reference: scopes.scopes[0].variablesReference }) as { variables: DebugVariable[] };
      expect(variables.variables.find(item => item.name === "answer")?.value).toBe("42");
      await session.control("continue", session.snapshot.threadId!);
      await expect.poll(() => session.snapshot.state).toBe("running");
      await expect(session.query({ kind: "scopes", ...identity, frameId: stack.stackFrames[0].id })).rejects.toThrow("expired");
    } finally {
      await session.finish();
      await rm(directory, { recursive: true, force: true });
    }
    expect(session.snapshot.state).toBe("terminated");
    await expect.poll(() => {
      try { process.kill(targetPid, 0); return true; }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") return false; throw error; }
    }).toBe(false);
  }, 30000);
});
