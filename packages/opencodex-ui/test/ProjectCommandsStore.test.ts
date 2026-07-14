/**
 * Covers project-command output lifecycle cleanup.
 */
import { describe, expect, it, vi } from "vitest";

import type { OpenCodexProjectCommandRun } from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "../src/stores/ProjectStore";
import { ProjectCommandsStore } from "../src/stores/ProjectCommandsStore";
import type { RootStore } from "../src/stores/RootStore";

describe("ProjectCommandsStore", () => {
  it("should discard partial output when a run is removed", () => {
    const store = createStore();
    const run = createRun();

    store.handleEvent({ type: "projectCommand.started", projectId: "project-1", run });
    store.handleEvent({
      type: "projectCommand.output",
      projectId: "project-1",
      commandId: run.commandId,
      runId: run.id,
      stream: "stdout",
      delta: "stale"
    });
    store.closeRun(run.commandId, run.id);

    store.handleEvent({ type: "projectCommand.started", projectId: "project-1", run });
    store.handleEvent({
      type: "projectCommand.output",
      projectId: "project-1",
      commandId: run.commandId,
      runId: run.id,
      stream: "stdout",
      delta: "fresh\n"
    });

    expect(store.getRuns(run.commandId)[0]?.lines.map((line) => line.text)).toEqual(["fresh"]);
  });
});

/** Creates a command store with inert project and transport dependencies. */
function createStore(): ProjectCommandsStore {
  const projectStore = {
    project: { id: "project-1", sourceId: "source-1" },
    isCodexSourceReady: true
  } as ProjectStore;
  const root = {
    request: vi.fn(async () => undefined),
    appStore: { errorMessage: null }
  } as unknown as RootStore;

  return new ProjectCommandsStore(projectStore, root);
}

/** Creates one deterministic running command fixture. */
function createRun(): OpenCodexProjectCommandRun {
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
    logPath: null
  };
}
