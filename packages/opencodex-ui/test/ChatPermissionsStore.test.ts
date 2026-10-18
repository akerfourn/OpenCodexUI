import { isObservable, runInAction } from "mobx";
import { describe, expect, it } from "vitest";
import { createPermissionsFixture, permissionSnapshot } from "./threadPermissions.fixture";

describe("per-chat permission state", () => {
  it("should load actual settings without changing permissions or application defaults", async () => {
    const { permissions, request } = createPermissionsFixture();

    await permissions.load();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ type: "threadPermissions.read",
      context: { threadId: "thread-1", sourceId: "source-1" } });
    expect(permissions.filesystem).toBe("read-only");
    expect(permissions.approvalsReviewer).toBe("user");
    expect(permissions.hasChanges).toBe(false);
  });

  it("should send cloneable user choices only after Apply and accept the confirmed settings", async () => {
    const { permissions, request } = createPermissionsFixture();
    await permissions.load();
    permissions.setFilesystem("workspace-write");
    permissions.setNetworkAccess(true);
    permissions.setReviewer("auto_review");
    expect(request).toHaveBeenCalledTimes(1);
    request.mockResolvedValueOnce(permissionSnapshot({ filesystem: "workspace-write", networkAccess: true,
      approvalsReviewer: "auto_review", profileId: null, revision: "revision-2" }));

    expect(await permissions.save()).toBe(true);

    const payload = request.mock.calls[1][0];
    expect(payload).toEqual({ type: "threadPermissions.change",
      context: { threadId: "thread-1", sourceId: "source-1" }, revision: "revision-1",
      patch: { filesystem: "workspace-write", networkAccess: true, approvalsReviewer: "auto_review" } });
    expect(isObservable(payload)).toBe(false);
    expect(structuredClone(payload)).toEqual(payload);
    expect(permissions.snapshot?.revision).toBe("revision-2");
    expect(permissions.didSave).toBe(true);
    expect(permissions.hasChanges).toBe(false);
  });

  it("should omit custom access settings on a reviewer-only edit", async () => {
    const { permissions, request } = createPermissionsFixture();
    request.mockResolvedValue(permissionSnapshot({ filesystem: "custom", networkAccess: null, canChangeAccess: false }));
    await permissions.load();
    permissions.setReviewer("auto_review");
    request.mockResolvedValueOnce(permissionSnapshot({ filesystem: "custom", networkAccess: null,
      canChangeAccess: false, approvalsReviewer: "auto_review" }));

    await permissions.save();

    expect(request.mock.calls[1][0]).toMatchObject({ patch: { approvalsReviewer: "auto_review" } });
    expect(Object.keys((request.mock.calls[1][0] as { patch: object }).patch)).toEqual(["approvalsReviewer"]);
  });

  it("should prevent duplicate saves and sends while settings are pending", async () => {
    const { chat, permissions, request } = createPermissionsFixture();
    await permissions.load();
    permissions.setReviewer("auto_review");
    let finish!: (value: unknown) => void;
    request.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));

    const saving = permissions.save();
    expect(await permissions.save()).toBe(false);
    expect(await chat.actions.send("Keep this draft")).toBe(false);
    expect(request).toHaveBeenCalledTimes(2);
    expect(permissions.didSave).toBe(false);
    finish(permissionSnapshot({ approvalsReviewer: "auto_review" }));
    await saving;
    expect(permissions.isSaving).toBe(false);
  });

  it("should invalidate an uncertain snapshot after failure and require a refresh", async () => {
    const { permissions, request } = createPermissionsFixture();
    await permissions.load();
    permissions.setReviewer("auto_review");
    request.mockRejectedValueOnce(new Error("Policy forbids this reviewer"));

    expect(await permissions.save()).toBe(false);

    expect(permissions.snapshot).toBeNull();
    expect(permissions.error).toBe("Policy forbids this reviewer");
    expect(permissions.didSave).toBe(false);
    expect(permissions.canEdit).toBe(false);
    await permissions.load();
    expect(permissions.canEdit).toBe(true);
    expect(permissions.approvalsReviewer).toBe("user");
  });

  it("should ignore a late result from another source", async () => {
    const { chat, permissions, request } = createPermissionsFixture();
    let finish!: (value: unknown) => void;
    request.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const reading = permissions.load();

    runInAction(() => { chat.thread.sourceId = "source-2"; });
    finish(permissionSnapshot());
    await reading;

    expect(permissions.snapshot).toBeNull();
    expect(permissions.isLoading).toBe(false);
  });

  it("should reject a snapshot for a different conversation", async () => {
    const { permissions, request } = createPermissionsFixture();
    request.mockResolvedValueOnce(permissionSnapshot({ threadId: "wrong-thread" }));

    await permissions.load();

    expect(permissions.snapshot).toBeNull();
    expect(permissions.error).toBe("Invalid effective conversation permissions.");
  });

  it.each(["draft", "active", "submitting"])("should avoid requests when the chat is %s", async (state) => {
    const { chat, permissions, request } = createPermissionsFixture();
    runInAction(() => {
      if (state === "draft") chat.isLocalDraft = true;
      if (state === "active") chat.runtime.isWorking = true;
      if (state === "submitting") chat.composer.isSubmitting = true;
    });

    await permissions.load();

    expect(request).not.toHaveBeenCalled();
    expect(permissions.isAvailable).toBe(false);
  });
});
