import { describe, test, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import ts from "typescript";
import type { DebugFrame, DebugSource } from "@open-codex-ui/opencodex-protocol";
import { adapterRuntime, debugFixture, inspectorProcess, stopFixtureProcess } from "./debugIntegrationFixtures.js";
import { DebugSession } from "../src/backend/debug/DebugSession.js";

/** Real target scenarios use only temporary local files and loopback networking. */
describe.runIf(process.env.DEBUG_ADAPTER_INTEGRATION === "1")("debug targets", () => {
  test("uses TypeScript source maps and returns the executed source", async () => {
    const fixture = await debugFixture();
    const source = "const answer: number = 42;\nconsole.log(answer);\nsetInterval(() => {}, 1000);\n";
    const compiled = ts.transpileModule(source, { fileName: "main.ts", compilerOptions: {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, sourceMap: true, inlineSources: true
    } });
    await writeFile(path.join(fixture.directory, "main.ts"), source);
    await writeFile(path.join(fixture.directory, "main.js"), compiled.outputText);
    await writeFile(path.join(fixture.directory, "main.js.map"), compiled.sourceMapText!);
    try {
      await fixture.session.start(adapterRuntime, [{ id: "ts", context: fixture.context, path: "main.ts", line: 2, enabled: true }]);
      await expect.poll(() => fixture.session.snapshot.state, { timeout: 15000 }).toBe("paused");
      const identity = { sessionId: fixture.session.snapshot.id, epoch: fixture.session.snapshot.epoch };
      const stack = await fixture.session.query({ kind: "stack", ...identity,
        threadId: fixture.session.snapshot.threadId! }) as { stackFrames: DebugFrame[] };
      expect(stack.stackFrames[0].source?.path).toMatch(/main\.ts$/);
      expect(stack.stackFrames[0].line).toBe(2);
      const result = await fixture.session.query({ kind: "source", ...identity, source: stack.stackFrames[0].source! }) as { content: string };
      expect(result.content).toBe(source);
    } finally { await fixture.dispose(); }
  }, 30000);

  test("detaches from an existing Node process without terminating it", async () => {
    const fixture = await debugFixture();
    const program = path.join(fixture.directory, "main.js");
    await writeFile(program, "setInterval(() => {\n  const answer = 42;\n  console.log(answer);\n}, 100);\n");
    const { child, port } = await inspectorProcess(program);
    const session = new DebugSession({ ...fixture.configuration, request: "attach", port }, () => undefined);
    try {
      await session.start(adapterRuntime, [{ id: "attach", context: fixture.context, path: "main.js", line: 3, enabled: true }]);
      await expect.poll(() => session.snapshot.state, { timeout: 15000 }).toBe("paused");
      await session.finish();
      expect(session.snapshot.state).toBe("terminated");
      expect(child.exitCode).toBeNull();
      expect(child.signalCode).toBeNull();
      expect(() => process.kill(child.pid!, 0)).not.toThrow();
    } finally { await session.finish(); await stopFixtureProcess(child); await fixture.dispose(); }
  }, 30000);

  test("recovers cleanly from a missing Node program", async () => {
    const fixture = await debugFixture({ program: "missing.js" });
    try {
      await fixture.session.start(adapterRuntime, []);
      await expect.poll(() => fixture.session.snapshot.state, { timeout: 20000 }).toBe("failed");
      expect(fixture.session.snapshot.error).toBeTruthy();
    } finally { await fixture.dispose(); }
  }, 30000);

  test.runIf(Boolean(process.env.DEBUG_CHROME_EXECUTABLE))("debugs a local Chrome page and closes its owned browser", async () => {
    const fixture = await debugFixture({ target: "chrome", runtime: process.env.DEBUG_CHROME_EXECUTABLE,
      args: ["--headless=new", "--disable-gpu", "--no-sandbox"] });
    const script = "setInterval(() => {\n  const answer = 42;\n  console.log(answer);\n}, 100);\n";
    const server = createServer((request, response) => {
      if (request.url === "/main.js") { response.setHeader("Content-Type", "text/javascript"); response.end(script); }
      else response.end('<!doctype html><script src="/main.js"></script>');
    });
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as { port: number };
    const session = new DebugSession({ ...fixture.configuration, url: `http://127.0.0.1:${address.port}/` }, () => undefined);
    await writeFile(path.join(fixture.directory, "main.js"), script);
    try {
      await session.start(adapterRuntime, [{ id: "chrome", context: fixture.context, path: "main.js", line: 3, enabled: true }]);
      await expect.poll(() => session.snapshot.state, { timeout: 15000 }).toBe("paused");
      const identity = { sessionId: session.snapshot.id, epoch: session.snapshot.epoch };
      const stack = await session.query({ kind: "stack", ...identity, threadId: session.snapshot.threadId! }) as { stackFrames: DebugFrame[] };
      expect(stack.stackFrames[0].line).toBe(3);
      const result = await session.query({ kind: "evaluate", ...identity, frameId: stack.stackFrames[0].id,
        expression: "answer", context: "watch" }) as { result: string };
      expect(result.result).toBe("42");
      const source = await session.query({ kind: "source", ...identity, source: stack.stackFrames[0].source as DebugSource }) as { content: string };
      expect(source.content).toContain("const answer = 42");
    } finally {
      await session.finish();
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await fixture.dispose();
    }
    expect(session.snapshot.state).toBe("terminated");
  }, 30000);
});
