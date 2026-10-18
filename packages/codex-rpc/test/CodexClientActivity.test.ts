import { describe, expect, it, vi } from "vitest";
import { CodexClientActivity } from "../src/CodexClientActivity";

describe("Codex source activity", () => {
  it("should publish changing reasons within a busy period without disclosing request arguments", () => {
    const changed = vi.fn();
    const detailsChanged = vi.fn();
    const activity = new CodexClientActivity(changed, detailsChanged);
    const command = activity.begin("command/exec", { command: ["private-command"], cwd: "/private/path" });
    activity.requestApproval("prompt");
    expect(changed.mock.calls).toEqual([[true]]);
    expect(detailsChanged).toHaveBeenCalledTimes(2);
    expect(activity.snapshot).toEqual({ requestMethods: ["command/exec"], turnCount: 0, threadCount: 0,
      approvalCount: 1, processCount: 0 });
    activity.notification({ method: "item/agentMessage/delta", params: { delta: "private-content" } });
    expect(detailsChanged).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(detailsChanged.mock.calls)).not.toContain("private-");
    activity.finish(command, {});
    expect(activity.snapshot.requestMethods).toEqual([]);
    expect(activity.active).toBe(true);
    expect(detailsChanged).toHaveBeenCalledTimes(3);
    activity.resolveApproval("prompt");
    expect(activity.active).toBe(false);
  });

  it.each(["account/rateLimits/read", "account/read", "model/list", "thread/read", "config/read"])(
    "should keep the instance idle during passive %s polling", method => {
      const changed = vi.fn();
      const activity = new CodexClientActivity(changed);
      const request = activity.begin(method, {});
      expect(activity.active).toBe(false);
      activity.finish(request, {});
      expect(changed).not.toHaveBeenCalled();
    }
  );

  it("should keep commands and unknown RPC methods protected even while passive reads finish", () => {
    const activity = new CodexClientActivity();
    const read = activity.begin("account/rateLimits/read", {});
    const command = activity.begin("command/exec", {});
    const unknown = activity.begin("future/mutation", {});
    activity.finish(read, {});
    activity.finish(command, {});
    expect(activity.active).toBe(true);
    activity.finish(unknown, {});
    expect(activity.active).toBe(false);
  });

  it("should detect actual active work returned by a passive thread read", () => {
    const activity = new CodexClientActivity();
    const request = activity.begin("thread/read", { threadId: "thread" });
    activity.finish(request, { thread: { id: "thread", status: { type: "active" } } });
    expect(activity.active).toBe(true);
  });

  it("should ignore a stale active response received after the native idle notification", () => {
    const activity = new CodexClientActivity();
    const request = activity.begin("thread/read", { threadId: "thread" });
    activity.notification({ method: "thread/status/changed", params: { threadId: "thread", status: { type: "idle" } } });
    activity.finish(request, { thread: { id: "thread", status: { type: "active" } } });
    expect(activity.active).toBe(false);
  });

  it("should ignore a stale idle response received after a turn has become active", () => {
    const activity = new CodexClientActivity();
    const request = activity.begin("thread/read", { threadId: "thread" });
    activity.notification({ method: "thread/status/changed", params: { threadId: "thread", status: { type: "active" } } });
    activity.finish(request, { thread: { id: "thread", status: { type: "idle" } } });
    expect(activity.active).toBe(true);
  });

  it("should release a completed turn without waiting for a redundant idle notification", () => {
    const activity = new CodexClientActivity();
    activity.notification({ method: "thread/status/changed", params: { threadId: "thread", status: { type: "active" } } });
    activity.notification({ method: "turn/started", params: { threadId: "thread", turn: { id: "turn" } } });
    activity.notification({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn" } } });
    expect(activity.active).toBe(false);
  });

  it("should release stale turn tracking on native idle and reject a late start response", () => {
    const activity = new CodexClientActivity();
    const request = activity.begin("turn/start", { threadId: "thread" });
    activity.notification({ method: "turn/started", params: { threadId: "thread", turn: { id: "turn" } } });
    activity.notification({ method: "thread/status/changed", params: { threadId: "thread", status: { type: "idle" } } });
    activity.finish(request, { turn: { id: "turn", status: "inProgress" } }, { threadId: "thread" });
    expect(activity.active).toBe(false);
  });

  it("should retain a started turn from its RPC response before notifications arrive", () => {
    const activity = new CodexClientActivity();
    const request = activity.begin("turn/start", { threadId: "thread" });
    activity.finish(request, { turn: { id: "turn", status: "inProgress" } }, { threadId: "thread" });
    expect(activity.active).toBe(true);
    activity.notification({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn" } } });
    expect(activity.active).toBe(false);
  });

  it("should not resurrect a turn when completion arrived before the start RPC response", () => {
    const activity = new CodexClientActivity();
    const request = activity.begin("turn/start", { threadId: "thread" });
    activity.notification({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn" } } });
    activity.finish(request, { turn: { id: "turn", status: "inProgress" } }, { threadId: "thread" });
    expect(activity.active).toBe(false);
  });

  it("should stay busy until overlapping requests and a running turn have all finished", () => {
    const changed = vi.fn();
    const activity = new CodexClientActivity(changed);
    const start = activity.begin("turn/start", {});
    const read = activity.begin("thread/read", {});
    activity.notification({ method: "turn/started", params: { threadId: "thread", turn: { id: "turn" } } });
    activity.finish(start, {});
    activity.finish(read, {});
    expect(activity.active).toBe(true);
    activity.notification({ method: "item/agentMessage/delta", params: { delta: "content" } });
    expect(changed.mock.calls).toEqual([[true]]);
    activity.notification({ method: "turn/completed", params: { threadId: "thread", turn: { id: "turn" } } });
    expect(changed.mock.calls).toEqual([[true], [false]]);
  });

  it("should keep native resumed work active until an idle status arrives", () => {
    const activity = new CodexClientActivity();
    const request = activity.begin("thread/resume", {});
    activity.finish(request, { thread: { id: "thread", status: { type: "active" } } });
    expect(activity.active).toBe(true);
    activity.notification({ method: "thread/status/changed", params: { threadId: "thread", status: { type: "idle" } } });
    expect(activity.active).toBe(false);
  });

  it("should count asynchronous processes after their spawn RPC has returned", () => {
    const activity = new CodexClientActivity();
    const request = activity.begin("process/spawn", { processHandle: "process" });
    activity.finish(request, {});
    expect(activity.active).toBe(true);
    activity.notification({ method: "process/exited", params: { processHandle: "different" } });
    expect(activity.active).toBe(true);
    activity.notification({ method: "process/exited", params: { processHandle: "process" } });
    expect(activity.active).toBe(false);
  });

  it("should handle process exit before the spawn response without resurrecting activity", () => {
    const activity = new CodexClientActivity();
    const request = activity.begin("process/spawn", { processHandle: "process" });
    activity.notification({ method: "process/exited", params: { processHandle: "process" } });
    activity.finish(request, {});
    expect(activity.active).toBe(false);
  });

  it("should forget explicitly refused spawns but preserve uncertain timed-out spawns", () => {
    const activity = new CodexClientActivity();
    const refused = activity.begin("process/spawn", { processHandle: "refused" });
    activity.refusedSpawn("process/spawn", { processHandle: "refused" });
    activity.finish(refused, undefined);
    expect(activity.active).toBe(false);
    const uncertain = activity.begin("process/spawn", { processHandle: "uncertain" });
    activity.finish(uncertain, undefined);
    expect(activity.active).toBe(true);
    activity.clear();
    expect(activity.active).toBe(false);
  });

  it("should require all pending approvals to be resolved", () => {
    const activity = new CodexClientActivity();
    activity.requestApproval(1);
    activity.requestApproval("second");
    activity.resolveApproval(1);
    expect(activity.active).toBe(true);
    activity.notification({ method: "serverRequest/resolved", params: { requestId: "second" } });
    expect(activity.active).toBe(false);
  });

  it("should release a closed thread without forgetting another thread", () => {
    const activity = new CodexClientActivity();
    for (const id of ["a", "b"]) {
      activity.notification({ method: "turn/started", params: { threadId: id, turn: { id } } });
    }
    activity.notification({ method: "thread/closed", params: { threadId: "a" } });
    expect(activity.active).toBe(true);
    activity.notification({ method: "thread/closed", params: { threadId: "b" } });
    expect(activity.active).toBe(false);
  });
});
