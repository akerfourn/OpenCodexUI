/**
 * Covers the public project-command definition and run lifecycle.
 */
import { describe, expect, it, vi } from "vitest";

import type {
  OpenCodexProjectCommand,
  OpenCodexProjectCommandRun
} from "@open-codex-ui/opencodex-protocol";
import { autorun } from "mobx";

import type { ProjectStore } from "../src/stores/project/ProjectStore";
import { ProjectCommandsStore } from "../src/stores/project/ProjectCommandsStore";
import type { RootStore } from "../src/stores/RootStore";

describe("ProjectCommandsStore run lifecycle", () => {
  it("should preserve the writable run-map property exposed by the facade", () => {
    const { store } = createStoreFixture();
    const run = createRun();
    const runsByCommandId = new Map([
      [run.commandId, [{ ...run, lines: [] }]]
    ]);

    store.runsByCommandId = runsByCommandId;

    expect(store.getRuns(run.commandId)).toEqual([{ ...run, lines: [] }]);
  });

  it("should ignore command events belonging to another project", () => {
    const { store } = createStoreFixture();

    store.handleEvent({
      type: "projectCommand.started",
      projectId: "project-2",
      run: createRun({ id: "other-run", projectId: "project-2" })
    });
    store.handleEvent({
      type: "projectCommand.output",
      projectId: "project-2",
      commandId: "command-1",
      runId: "other-run",
      stream: "stdout",
      delta: "ignored\n"
    });
    store.handleEvent({
      type: "projectCommand.exited",
      projectId: "project-2",
      commandId: "command-1",
      runId: "other-run",
      status: "exited",
      exitCode: 0,
      exitedAt: "2026-07-14T00:01:00.000Z"
    });

    expect(store.getRuns("command-1")).toEqual([]);
  });

  it("should keep delegated runs observable and facade callbacks bound", () => {
    const { store } = createStoreFixture();
    const run = createRun();
    const observedRunCounts: number[] = [];
    const stopObserving = autorun(() => {
      observedRunCounts.push(store.getRuns(run.commandId).length);
    });

    startRun(store, run);
    const closeRun = store.closeRun;
    closeRun(run.commandId, run.id);
    stopObserving();

    expect(observedRunCounts).toEqual([0, 1, 0]);
  });

  it("should remove a command and clear fragments from its runs", async () => {
    const command = createCommand();
    const { store, root } = createStoreFixture();
    const run = createRun({ commandId: command.id });

    store.commands = [command];
    startRun(store, run);
    sendOutput(store, run, "stdout", "stale stdout");
    sendOutput(store, run, "stderr", "stale stderr");

    await store.deleteCommand(command.id);

    expect(root.request).toHaveBeenCalledWith({
      type: "projectCommands.delete",
      commandId: command.id
    });
    expect(store.commands).toEqual([]);
    expect(store.getRuns(command.id)).toEqual([]);

    startRun(store, run);
    sendOutput(store, run, "stdout", "fresh stdout\n");
    sendOutput(store, run, "stderr", "fresh stderr\n");

    expect(store.getRuns(command.id)[0]?.lines.map((line) => line.text)).toEqual([
      "fresh stdout",
      "fresh stderr"
    ]);
  });

  it("should allow parallel commands while a previous run is active", () => {
    const { store } = createStoreFixture();
    const run = createRun();
    const serialCommand = createCommand({ executionMode: "project" });
    const parallelCommand = createCommand({ executionMode: "parallel" });

    startRun(store, run);

    expect(store.canRunCommand(serialCommand)).toBe(false);
    expect(store.canRunCommand(parallelCommand)).toBe(true);
  });

  it("should block only the matching workspace for workspace-scoped commands", () => {
    const { store } = createStoreFixture();
    const command = createCommand({ executionMode: "workspace" });
    startRun(store, createRun({ cwd: "/other", sourceId: "source-1" }));
    expect(store.canRunCommand(command)).toBe(true);
    expect(store.canRunCommand(createCommand({ executionMode: "project" }))).toBe(false);
    startRun(store, createRun({ id: "current", cwd: "/workspace/project", sourceId: "source-1" }));
    expect(store.canRunCommand(command)).toBe(false);
    expect(store.canRunCommand(createCommand({ executionMode: "parallel" }))).toBe(true);
  });

  it("should reserve pending launches against their original workspace", async () => {
    let resolve!: (run: OpenCodexProjectCommandRun) => void;
    const request = vi.fn(() => new Promise<OpenCodexProjectCommandRun>((done) => { resolve = done; }));
    const { store, projectStore } = createStoreFixture(request as RootStore["request"]);
    const command = createCommand({ executionMode: "workspace" });
    const pending = store.runCommand(command);
    expect(store.canRunCommand(command)).toBe(false);
    await store.runCommand(command);
    expect(request).toHaveBeenCalledOnce();
    projectStore.project.path = "/other";
    Object.defineProperty(projectStore, "projectPath", { value: "/other", configurable: true });
    expect(store.canRunCommand(command)).toBe(true);
    expect(store.canRunCommand(createCommand({ executionMode: "project" }))).toBe(false);
    resolve(createRun({ cwd: "/workspace/project", sourceId: "source-1" }));
    await pending;
    expect(store.isRunningCommand).toBe(false);
    expect(store.canRunCommand(command)).toBe(true);
    expect(request.mock.calls[0]?.[0]).toMatchObject({ projectPath: "/workspace/project" });
  });

  it("should retain pending activity until all parallel launches settle", async () => {
    const completions: Array<(run: OpenCodexProjectCommandRun) => void> = [];
    const request = vi.fn(() => new Promise<OpenCodexProjectCommandRun>((resolve) => completions.push(resolve)));
    const { store } = createStoreFixture(request as RootStore["request"]);
    const command = createCommand({ executionMode: "parallel" });
    const first = store.runCommand(command);
    const second = store.runCommand(command);
    expect(request).toHaveBeenCalledTimes(2);
    completions[0]!(createRun());
    await first;
    expect(store.isRunningCommand).toBe(true);
    completions[1]!(createRun({ id: "second" }));
    await second;
    expect(store.isRunningCommand).toBe(false);
    expect(store.getRuns(command.id)).toHaveLength(2);
  });

  it("should send the explicit execution mode when saving a command", async () => {
    const request = vi.fn(async () => createCommand({ executionMode: "workspace" }));
    const { store } = createStoreFixture(request as RootStore["request"]);
    await store.createCommand({ name: " Build ", command: " npm test ", executionMode: "workspace", persistLogs: false });
    expect(request).toHaveBeenCalledWith({ type: "projectCommands.create", projectId: "project-1",
      name: "Build", command: "npm test", executionMode: "workspace", persistLogs: false });
  });

  it("should expose whether a command run is active", () => {
    const { store } = createStoreFixture();
    const run = createRun();

    expect(store.hasActiveRun).toBe(false);

    startRun(store, run);

    expect(store.hasActiveRun).toBe(true);

    store.handleEvent({
      type: "projectCommand.exited",
      projectId: "project-1",
      commandId: run.commandId,
      runId: run.id,
      status: "exited",
      exitCode: 0,
      exitedAt: "2026-07-14T00:01:00.000Z"
    });

    expect(store.hasActiveRun).toBe(false);
  });

  it("should display the localized label for the primary workspace", () => {
    const { store } = createStoreFixture();

    expect(store.getRunWorkspaceLabel(createRun({
      cwd: "/workspace/project",
      workspaceId: "workspace-primary"
    }), "Principal")).toBe("Principal");
  });

  it("should send the command run payload and retain the accepted run", async () => {
    const run = createRun();
    const command = createCommand();
    const request = vi.fn(async () => run) as unknown as RootStore["request"];
    const { store, root } = createStoreFixture(request);

    await store.runCommand(command);

    expect(root.request).toHaveBeenCalledWith({
      type: "projectCommands.run",
      commandId: command.id,
      projectPath: "/workspace/project",
      sourceId: "source-1"
    });
    expect(store.getRuns(command.id)[0]).toMatchObject({ id: run.id, lines: [] });
    expect(store.isRunningCommand).toBe(false);
  });

  it("should expose a run request error and reset its in-flight state", async () => {
    const request = vi.fn(async () => {
      throw new Error("unable to start command");
    }) as unknown as RootStore["request"];
    const { store, root } = createStoreFixture(request);

    await store.runCommand(createCommand());

    expect(root.appStore.errorMessage).toBe("unable to start command");
    expect(store.isRunningCommand).toBe(false);
    expect(store.getRuns("command-1")).toEqual([]);
  });
});

/** Creates an inert command store and its observable request mock. */
function createStoreFixture(
  request: RootStore["request"] = vi.fn() as unknown as RootStore["request"]
): { store: ProjectCommandsStore; root: RootStore; projectStore: ProjectStore } {
  const projectStore = {
    project: {
      id: "project-1",
      path: "/workspace/project",
      sourceId: "source-1"
    },
    projectPath: "/workspace/project",
    workspaces: {
      workspaces: [{
        id: "workspace-primary",
        name: null,
        projectId: "project-1",
        sourceId: "source-1",
        path: "/workspace/project",
        isPrimary: true,
        managed: false,
        removedAt: null
      }]
    },
    isCodexSourceReady: true
  } as ProjectStore;
  const root = {
    request,
    appStore: { errorMessage: null }
  } as unknown as RootStore;

  return { store: new ProjectCommandsStore(projectStore, root), root, projectStore };
}

/** Creates one deterministic command definition. */
function createCommand(
  overrides: Partial<OpenCodexProjectCommand> = {}
): OpenCodexProjectCommand {
  return {
    id: "command-1",
    projectId: "project-1",
    name: "Test command",
    command: "echo test",
    executionMode: "project",
    persistLogs: false,
    sortOrder: 0,
    createdAt: "2026-07-14T00:00:00.000Z",
    updatedAt: "2026-07-14T00:00:00.000Z",
    ...overrides
  };
}

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

/** Applies a started event through the project-scoped facade. */
function startRun(store: ProjectCommandsStore, run: OpenCodexProjectCommandRun): void {
  store.handleEvent({ type: "projectCommand.started", projectId: "project-1", run });
}

/** Sends one output delta through the project-scoped facade. */
function sendOutput(
  store: ProjectCommandsStore,
  run: OpenCodexProjectCommandRun,
  stream: "stdout" | "stderr",
  delta: string
): void {
  store.handleEvent({
    type: "projectCommand.output",
    projectId: "project-1",
    commandId: run.commandId,
    runId: run.id,
    stream,
    delta
  });
}
