import { describe, expect, test } from "vitest";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { DebugFrame } from "@open-codex-ui/opencodex-protocol";
import { adapterRuntime, debugFixture } from "./debugIntegrationFixtures";

/** Uses only the bundled adapter, temporary fixtures and loopback connections; no external service. */
describe.runIf(process.env.DEBUG_ADAPTER_INTEGRATION === "1")("advanced Node launch", () => {
  test("applies env files, explicit overrides, runtime arguments and the entry pause", async () => {
    const fixture = await debugFixture({ advanced: {
      envFile: ".env", env: { DEBUG_TEST_MODE: "explicit", DEBUG_TEST_REMOVED: null },
      runtimeArgs: ["--no-warnings"], stopOnEntry: true, skipFiles: ["<node_internals>/**"]
    } });
    await writeFile(path.join(fixture.directory, ".env"),
      "DEBUG_TEST_MODE=file\nDEBUG_TEST_FROM_FILE=loaded\nDEBUG_TEST_REMOVED=remove-me\n");
    await writeFile(path.join(fixture.directory, "main.js"), "const answer = 42;\nsetInterval(() => {}, 1000);\n");
    try {
      const session = fixture.session;
      await session.start(adapterRuntime, []);
      await expect.poll(() => session.snapshot.state, { timeout: 15000 }).toBe("paused");
      expect(session.snapshot.error).toBeUndefined();
      const identity = { sessionId: session.snapshot.id, epoch: session.snapshot.epoch };
      const stack = await session.query({ kind: "stack", ...identity, threadId: session.snapshot.threadId! }) as { stackFrames: DebugFrame[] };
      expect(stack.stackFrames[0].source?.path).toBe(path.join(fixture.directory, "main.js"));
      const result = await session.query({ kind: "evaluate", ...identity, frameId: stack.stackFrames[0].id,
        context: "watch", expression: `[
          process.env.DEBUG_TEST_MODE === 'explicit', process.env.DEBUG_TEST_FROM_FILE === 'loaded',
          process.env.DEBUG_TEST_REMOVED === undefined, process.execArgv.includes('--no-warnings'),
          process.env.ELECTRON_RUN_AS_NODE === undefined
        ].every(Boolean)` }) as { result: string };
      expect(result.result).toBe("true");
      await session.control("continue", session.snapshot.threadId!);
      await expect.poll(() => session.snapshot.state).toBe("running");
    } finally { await fixture.dispose(); }
    expect(fixture.session.snapshot.state).toBe("terminated");
  }, 30000);
});
