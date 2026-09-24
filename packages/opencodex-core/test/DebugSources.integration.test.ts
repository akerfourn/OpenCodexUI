import { describe, test, expect } from "vitest";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { DebugFrame } from "@open-codex-ui/opencodex-protocol";
import { debugFixture, adapterRuntime } from "./debugIntegrationFixtures.js";

describe.runIf(process.env.DEBUG_ADAPTER_INTEGRATION === "1")("stepping and generated sources", () => {
  test("steps into, out of and over a local function with fresh frames", async () => {
    const fixture = await debugFixture();
    await writeFile(path.join(fixture.directory, "main.js"), [
      "function increment(value) {", "  return value + 1;", "}", "const answer = 42;",
      "const result = increment(answer);", "console.log(result);", "setInterval(() => {}, 1000);"
    ].join("\n"));
    const session = fixture.session;
    try {
      await session.start(adapterRuntime, [{ id: "step", context: fixture.context, path: "main.js", line: 5, enabled: true }]);
      await expect.poll(() => session.snapshot.state, { timeout: 15000 }).toBe("paused");
      let epoch = session.snapshot.epoch;
      await session.control("stepIn", session.snapshot.threadId!);
      await expect.poll(() => session.snapshot.state === "paused" && session.snapshot.epoch > epoch).toBe(true);
      const stack = await session.query({ kind: "stack", sessionId: session.snapshot.id,
        epoch: session.snapshot.epoch, threadId: session.snapshot.threadId! }) as { stackFrames: DebugFrame[] };
      expect(stack.stackFrames[0].name).toMatch(/(?:^|\.)increment$/);
      expect(stack.stackFrames[0].line).toBe(2);
      epoch = session.snapshot.epoch;
      await session.control("stepOut", session.snapshot.threadId!);
      await expect.poll(() => session.snapshot.state === "paused" && session.snapshot.epoch > epoch).toBe(true);
      epoch = session.snapshot.epoch;
      await session.control("next", session.snapshot.threadId!);
      await expect.poll(() => session.snapshot.state === "paused" && session.snapshot.epoch > epoch).toBe(true);
      await session.control("continue", session.snapshot.threadId!);
      await expect.poll(() => session.snapshot.state).toBe("running");
    } finally { await fixture.dispose(); }
  }, 30000);

  test("retrieves an evaluated source through sourceReference without a physical file", async () => {
    const fixture = await debugFixture();
    const generated = "const generatedValue = 42;\ndebugger;\ngeneratedValue;\n//# sourceURL=generated-debug-test.js";
    await writeFile(path.join(fixture.directory, "main.js"), `eval(${JSON.stringify(generated)});\nsetInterval(() => {}, 1000);`);
    const session = fixture.session;
    try {
      await session.start(adapterRuntime, []);
      await expect.poll(() => session.snapshot.state, { timeout: 15000 }).toBe("paused");
      const identity = { sessionId: session.snapshot.id, epoch: session.snapshot.epoch };
      const stack = await session.query({ kind: "stack", ...identity, threadId: session.snapshot.threadId! }) as { stackFrames: DebugFrame[] };
      const source = stack.stackFrames[0].source!;
      expect(source.sourceReference).toBeGreaterThan(0);
      const response = await session.query({ kind: "source", ...identity, source }) as { content: string };
      expect(response.content).toBe(generated);
    } finally { await fixture.dispose(); }
  }, 30000);
});
