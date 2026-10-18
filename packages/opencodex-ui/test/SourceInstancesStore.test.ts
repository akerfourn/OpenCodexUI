import { isObservable } from "mobx";
import { describe, expect, it } from "vitest";
import { instanceSnapshot, instanceStore } from "./sourceInstances.fixture";
import { ProjectsStore } from "../src/stores/project/ProjectsStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

describe("source instance UI state", () => {
  it("should clear an update-in-progress rejection after a stopped source finishes updating", async () => {
    const { instances, request } = instanceStore();
    instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ phase: "updating" }) });
    request.mockRejectedValueOnce(new Error("SOURCE_UPDATING: Wait"));
    await instances.control("a", "start");
    expect(instances.errors.get("a")).toContain("SOURCE_UPDATING");
    instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ phase: "stopped" }) });
    expect(instances.errors.has("a")).toBe(false);
  });

  it("should copy nested reason data from transport snapshots", () => {
    const { instances } = instanceStore();
    const snapshot = instanceSnapshot({ isActive: true, activity: {
      requestMethods: ["command/exec"], turnCount: 0, threadCount: 0, approvalCount: 0, processCount: 0
    } });
    instances.handleEvent({ type: "sourceInstances.changed", snapshot });
    snapshot.activity!.requestMethods.push("outside-mutation");
    expect(instances.states.get("a")?.activity?.requestMethods).toEqual(["command/exec"]);
  });

  it("should read metadata without starting instances and retain newer source events", async () => {
    const { instances, request } = instanceStore();
    let resolve!: (result: unknown) => void;
    request.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const loading = instances.load();
    instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ isActive: true }) });
    resolve([instanceSnapshot(), instanceSnapshot({ sourceId: "b", phase: "stopped" })]);
    await loading;
    expect(instances.states.get("a")?.isActive).toBe(true);
    expect(instances.states.get("b")?.phase).toBe("stopped");
    expect(request.mock.calls).toEqual([[{ type: "sourceInstances.list" }]]);
  });

  it("should show a read failure without inventing a stopped state", async () => {
    const { instances, request } = instanceStore();
    request.mockRejectedValueOnce(new Error("Disconnected"));
    await instances.load();
    expect(instances.loadError).toBe("Disconnected");
    expect(instances.states.has("b")).toBe(false);
    expect(instances.isLoading).toBe(false);
  });

  it("should send plain source-specific controls and never automatically retry with force", async () => {
    const { instances, request } = instanceStore();
    request.mockRejectedValueOnce(new Error("SOURCE_BUSY"));
    expect(await instances.control("a", "stop")).toBe(false);
    expect(instances.errors.get("a")).toBe("SOURCE_BUSY");
    expect(request.mock.calls).toEqual([[{ type: "sourceInstances.stop", sourceId: "a", force: false }]]);
    expect(await instances.control("a", "restart", true)).toBe(true);
    const payload = request.mock.calls[1]![0];
    expect(payload).toEqual({ type: "sourceInstances.restart", sourceId: "a", force: true });
    expect(isObservable(payload)).toBe(false);
    expect(structuredClone(payload)).toEqual(payload);
  });

  it("should retain live activity instead of applying a stale control response", async () => {
    const { instances, request } = instanceStore();
    request.mockResolvedValueOnce(instanceSnapshot());
    instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ isActive: true }) });
    await instances.control("a", "start");
    expect(instances.states.get("a")?.isActive).toBe(true);
  });

  it("should allow force during a hung start and ignore its later failure", async () => {
    const { instances, request } = instanceStore();
    let reject!: (error: Error) => void;
    request.mockReturnValueOnce(new Promise((_resolve, fail) => { reject = fail; }));
    const starting = instances.control("a", "start");
    instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ phase: "starting" }) });
    expect(await instances.control("a", "stop", true)).toBe(true);
    reject(new Error("Old startup interrupted"));
    expect(await starting).toBe(false);
    expect(instances.errors.has("a")).toBe(false);
    expect(instances.pending.has("a")).toBe(false);
    expect(request.mock.calls).toHaveLength(2);
  });

  it("should clear runtime polling only for chats of the stopped source", () => {
    const projects = new ProjectsStore({} as RootStore);
    let resetsA = 0;
    let resetsB = 0;
    const project = { chatsById: new Map([
      ["first", { sourceId: "a", runtime: { reset: () => { resetsA += 1; } } }],
      ["second", { sourceId: "b", runtime: { reset: () => { resetsB += 1; } } }]
    ]) } as unknown as ProjectStore;
    projects.projectStoresById.set("project", project);
    projects.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot({ phase: "stopped" }) });
    expect(resetsA).toBe(1);
    expect(resetsB).toBe(0);
  });
});
