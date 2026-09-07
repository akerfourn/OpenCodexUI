import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceThreadTransition, WorkspaceTransitionError } from
  "../src/backend/workspaces/WorkspaceThreadTransition";
import type { WorkspaceResumeExpectation, WorkspaceResumeResponse } from
  "../src/backend/workspaces/workspaceResumeVerification";

/** Models the destination prepared by the backend, including intentional shared write access. */
function destination(cwd = "/source/B"): WorkspaceResumeExpectation {
  return {
    cwd, runtimeWorkspaceRoots: [cwd],
    activePermissionProfile: { id: "workspace-B", extends: ":workspace" },
    sandbox: { type: "workspaceWrite", writableRoots: ["/shared"],
      networkAccess: false, excludeTmpdirEnvVar: true, excludeSlashTmp: true },
    approvalPolicy: "never", approvalsReviewer: "user"
  };
}

/** Supplies only response fields relevant to this boundary, leaving unrelated RPC fields out. */
function resumed(expected = destination()): WorkspaceResumeResponse {
  return {
    ...structuredClone(expected),
    thread: { id: "thread", status: { type: "idle" }, canAcceptDirectInput: true }
  } as WorkspaceResumeResponse;
}

describe("workspace thread transition", () => {
  const client = {
    getMetadata: vi.fn(), readThread: vi.fn(), unsubscribeThread: vi.fn(), resumeThread: vi.fn()
  };
  const beforeDispatch = vi.fn();
  let service: WorkspaceThreadTransition;

  beforeEach(() => {
    vi.resetAllMocks();
    client.getMetadata.mockResolvedValue({ isDirectory: true });
    client.readThread.mockResolvedValue({ thread: {
      id: "thread", status: { type: "idle" }, canAcceptDirectInput: true, source: "cli"
    } });
    client.unsubscribeThread.mockResolvedValue({ status: "unsubscribed" });
    client.resumeThread.mockResolvedValue(resumed());
    beforeDispatch.mockResolvedValue(undefined);
    service = new WorkspaceThreadTransition(client);
  });

  it("should reserve dispatch before unsubscribe and resume the same thread with explicit context", async () => {
    const response = await service.resume("thread", destination(), beforeDispatch);

    expect(response.cwd).toBe("/source/B");
    expect(client.resumeThread).toHaveBeenCalledTimes(1);
    expect(client.resumeThread).toHaveBeenCalledWith("thread", {
      cwd: "/source/B", runtimeWorkspaceRoots: ["/source/B"], permissions: "workspace-B",
      approvalPolicy: "never", approvalsReviewer: "user", excludeTurns: true
    });
    expect(beforeDispatch.mock.invocationCallOrder[0]).toBeLessThan(client.unsubscribeThread.mock.invocationCallOrder[0]);
    expect(client.unsubscribeThread.mock.invocationCallOrder[0]).toBeLessThan(client.resumeThread.mock.invocationCallOrder[0]);
  });

  it.each(["active", "systemError", "unknown"])("should refuse %s threads before dispatch", async (type) => {
    client.readThread.mockResolvedValue({ thread: { id: "thread", status: { type } } });
    await expect(service.resume("thread", destination(), beforeDispatch)).rejects.toMatchObject({
      requiresReconciliation: false, message: expect.stringContaining("status is unknown")
    });
    expect(beforeDispatch).not.toHaveBeenCalled();
    expect(client.unsubscribeThread).not.toHaveBeenCalled();
  });

  it("should refuse missing directories before touching the thread", async () => {
    client.getMetadata.mockResolvedValue({ isDirectory: false });
    await expect(service.resume("thread", destination(), beforeDispatch)).rejects.toMatchObject({
      requiresReconciliation: false
    });
    expect(client.readThread).not.toHaveBeenCalled();
  });

  it.each(["relative/B", "C:relative", " /source/B"])("should reject non-absolute source path %s before I/O", async (cwd) => {
    await expect(service.resume("thread", destination(cwd), beforeDispatch)).rejects.toThrow("absolute");
    expect(client.getMetadata).not.toHaveBeenCalled();
  });

  it("should preserve Windows source paths without resolving them on the host", async () => {
    const expected = destination("C:\\repo\\B");
    expected.sandbox.writableRoots = [];
    client.resumeThread.mockResolvedValue(resumed(expected));
    await service.resume("thread", expected, beforeDispatch);
    expect(client.getMetadata).toHaveBeenCalledWith("C:\\repo\\B");
  });

  it("should reject child threads even when they are idle", async () => {
    client.readThread.mockResolvedValue({ thread: {
      id: "thread", status: { type: "idle" }, source: { subagent: "review" }
    } });
    await expect(service.resume("thread", destination(), beforeDispatch)).rejects.toThrow("Sub-agent");
    expect(client.unsubscribeThread).not.toHaveBeenCalled();
  });

  it("should not dispatch when durable reservation fails", async () => {
    beforeDispatch.mockRejectedValue(new Error("reservation unavailable"));
    await expect(service.resume("thread", destination(), beforeDispatch)).rejects.toMatchObject({
      requiresReconciliation: false, message: "reservation unavailable"
    });
    expect(client.unsubscribeThread).not.toHaveBeenCalled();
  });

  it.each(["unsubscribeThread", "resumeThread"] as const)("should preserve uncertainty after lost %s response", async (method) => {
    client[method].mockRejectedValue(new Error("connection lost"));
    const error = await service.resume("thread", destination(), beforeDispatch).catch((cause) => cause);
    expect(error).toBeInstanceOf(WorkspaceTransitionError);
    expect(error).toMatchObject({ requiresReconciliation: true, message: "connection lost" });
    expect(client[method]).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["cwd", { cwd: "/source/A" }],
    ["roots", { runtimeWorkspaceRoots: ["/source/B", "/source/A"] }],
    ["profile", { activePermissionProfile: { id: "workspace-A", extends: ":workspace" } }],
    ["sandbox", { sandbox: { ...destination().sandbox, writableRoots: ["/shared", "/source/A"] } }],
    ["network", { sandbox: { ...destination().sandbox, networkAccess: true } }],
    ["tmp", { sandbox: { ...destination().sandbox, excludeSlashTmp: false } }],
    ["approvals", { approvalPolicy: "on-request" }],
    ["reviewer", { approvalsReviewer: "guardian_subagent" }],
    ["broad sandbox", { sandbox: { type: "dangerFullAccess" } }],
    ["missing capabilities", { thread: { id: "thread", status: { type: "idle" } } }]
  ])("should require reconciliation when Codex retains unexpected %s", async (_name, patch) => {
    client.resumeThread.mockResolvedValue({ ...resumed(), ...patch });
    await expect(service.resume("thread", destination(), beforeDispatch)).rejects.toMatchObject({
      requiresReconciliation: true
    });
  });

  it("should accept an unloaded thread but verify direct input support after resume", async () => {
    client.readThread.mockResolvedValue({ thread: {
      id: "thread", status: { type: "notLoaded" }, canAcceptDirectInput: null, source: "cli"
    } });
    client.unsubscribeThread.mockResolvedValue({ status: "notLoaded" });
    await expect(service.resume("thread", destination(), beforeDispatch)).resolves.toMatchObject({ cwd: "/source/B" });
  });

  it("should freeze the requested context before asynchronous caller mutation", async () => {
    const expected = destination();
    client.getMetadata.mockImplementation(async () => {
      expected.cwd = "/source/A";
      expected.runtimeWorkspaceRoots.push("/source/A");
      return { isDirectory: true };
    });
    await service.resume("thread", expected, beforeDispatch);
    expect(client.resumeThread).toHaveBeenCalledWith("thread", expect.objectContaining({
      cwd: "/source/B", runtimeWorkspaceRoots: ["/source/B"]
    }));
  });

  it("should send the frozen managed profile definition with resume instead of relying on its name alone", async () => {
    const expected = destination();
    expected.config = { "permissions.workspace-B": { extends: ":workspace", network: { enabled: false } } };
    await service.resume("thread", expected, beforeDispatch);
    expect(client.resumeThread).toHaveBeenCalledWith("thread", expect.objectContaining({ config: expected.config }));
  });
});
