/**
 * Covers the public run reducer extracted from the project command store.
 */
import { describe, expect, it } from "vitest";

import type { OpenCodexProjectCommandRun } from "@open-codex-ui/opencodex-protocol";

import { ProjectCommandRunsStore } from "../src/stores/ProjectCommandRunsStore";

describe("ProjectCommandRunsStore", () => {
  it("should make a started run idempotent", () => {
    const store = new ProjectCommandRunsStore();
    const run = createRun();

    store.applyRunStarted(run);
    store.applyRunStarted(run);

    expect(store.getRuns(run.commandId)).toHaveLength(1);
    expect(store.getRuns(run.commandId)[0]).toMatchObject({
      id: run.id,
      status: "running",
      lines: []
    });
  });

  it("should ignore output and exit events for an unknown run", () => {
    const store = new ProjectCommandRunsStore();

    store.applyRunOutput("command-1", "unknown-run", "stdout", "ignored\n");
    store.applyRunExited(
      "command-1",
      "unknown-run",
      "failed",
      1,
      "2026-07-14T00:01:00.000Z"
    );

    expect(store.getRuns("command-1")).toEqual([]);
  });

  it("should keep stdout and stderr buffers separate and flush stdout first", () => {
    const store = new ProjectCommandRunsStore();
    const run = createRun();

    store.applyRunStarted(run);
    store.applyRunOutput(run.commandId, run.id, "stdout", "standard output");
    store.applyRunOutput(run.commandId, run.id, "stderr", "standard error");
    store.applyRunExited(
      run.commandId,
      run.id,
      "exited",
      0,
      "2026-07-14T00:01:00.000Z"
    );

    expect(store.getRuns(run.commandId)[0]?.lines.map(({ stream, text }) => ({ stream, text })))
      .toEqual([
        { stream: "stdout", text: "standard output" },
        { stream: "stderr", text: "standard error" }
      ]);
  });

  it("should retain only the latest 100 output lines", () => {
    const store = new ProjectCommandRunsStore();
    const run = createRun();

    store.applyRunStarted(run);
    store.applyRunOutput(
      run.commandId,
      run.id,
      "stdout",
      Array.from({ length: 105 }, (_, index) => `line-${index}\n`).join("")
    );

    const lines = store.getRuns(run.commandId)[0]?.lines ?? [];

    expect(lines).toHaveLength(100);
    expect(lines[0]?.text).toBe("line-5");
    expect(lines[99]?.text).toBe("line-104");
  });

  it("should clear both stream fragments when a run is closed", () => {
    const store = new ProjectCommandRunsStore();
    const run = createRun();

    store.applyRunStarted(run);
    store.applyRunOutput(run.commandId, run.id, "stdout", "stale stdout");
    store.applyRunOutput(run.commandId, run.id, "stderr", "stale stderr");
    store.closeRun(run.commandId, run.id);

    store.applyRunStarted(run);
    store.applyRunOutput(run.commandId, run.id, "stdout", "fresh stdout\n");
    store.applyRunOutput(run.commandId, run.id, "stderr", "fresh stderr\n");

    expect(store.getRuns(run.commandId)[0]?.lines.map((line) => line.text)).toEqual([
      "fresh stdout",
      "fresh stderr"
    ]);
  });

  it("should clear fragments for every run when a command is removed", () => {
    const store = new ProjectCommandRunsStore();
    const firstRun = createRun({ id: "run-1" });
    const secondRun = createRun({ id: "run-2" });

    store.applyRunStarted(firstRun);
    store.applyRunStarted(secondRun);
    store.applyRunOutput(firstRun.commandId, firstRun.id, "stdout", "stale one");
    store.applyRunOutput(secondRun.commandId, secondRun.id, "stderr", "stale two");
    store.clearCommand(firstRun.commandId);

    expect(store.getRuns(firstRun.commandId)).toEqual([]);

    store.applyRunStarted(firstRun);
    store.applyRunOutput(firstRun.commandId, firstRun.id, "stdout", "fresh one\n");
    store.applyRunStarted(secondRun);
    store.applyRunOutput(secondRun.commandId, secondRun.id, "stderr", "fresh two\n");

    expect(store.getRuns(firstRun.commandId)[0]?.lines.map((line) => line.text)).toEqual([
      "fresh one"
    ]);
    expect(store.getRuns(secondRun.commandId)[1]?.lines.map((line) => line.text)).toEqual([
      "fresh two"
    ]);
  });

  it("should clear pending fragments when disposed", () => {
    const store = new ProjectCommandRunsStore();
    const run = createRun();

    store.applyRunStarted(run);
    store.applyRunOutput(run.commandId, run.id, "stdout", "stale");
    store.applyRunOutput(run.commandId, run.id, "stderr", "stale error");
    store.dispose();
    store.applyRunOutput(run.commandId, run.id, "stdout", "fresh\n");
    store.applyRunOutput(run.commandId, run.id, "stderr", "fresh error\n");

    expect(store.getRuns(run.commandId)[0]?.lines.map((line) => line.text)).toEqual([
      "fresh",
      "fresh error"
    ]);
  });
});

/** Creates one deterministic running command fixture. */
function createRun(
  overrides: Partial<OpenCodexProjectCommandRun> = {}
): OpenCodexProjectCommandRun {
  return {
    id: "run-1",
    projectId: "project-1",
    commandId: "command-1",
    processHandle: "process-1",
    command: "echo test",
    status: "running",
    startedAt: "2026-07-14T00:00:00.000Z",
    exitedAt: null,
    exitCode: null,
    logPath: null,
    ...overrides
  };
}
