import { isObservable } from "mobx";
import { describe, expect, it } from "vitest";
import { createSourcePermissionsFixture, sourcePermissionSnapshot } from "./sourcePermissions.fixture";

describe("source default permission state", () => {
  it("should read only on demand and keep choices local until Apply", async () => {
    const { permissions, request } = createSourcePermissionsFixture();
    expect(request).not.toHaveBeenCalled();
    await permissions.load();
    permissions.setValue("approvalsReviewer", "auto_review");

    expect(request.mock.calls).toEqual([[{ type: "sourcePermissions.read", sourceId: "source-a" }]]);
    expect(permissions.hasChanges).toBe(true);
    expect(permissions.didSave).toBe(false);
  });

  it("should send only changed primitives and accept a confirmed native result", async () => {
    const { permissions, request } = createSourcePermissionsFixture();
    await permissions.load();
    permissions.setValue("approvalsReviewer", "auto_review");
    request.mockResolvedValueOnce(sourcePermissionSnapshot({ approvalsReviewer: "auto_review", revision: "version-2" }));

    expect(await permissions.save()).toBe(true);

    const payload = request.mock.calls[1]![0];
    expect(payload).toEqual({ type: "sourcePermissions.change", sourceId: "source-a", revision: "version-1",
      patch: { approvalsReviewer: "auto_review" } });
    expect(isObservable(payload.patch)).toBe(false);
    expect(structuredClone(payload)).toEqual(payload);
    expect(permissions.hasChanges).toBe(false);
    expect(permissions.didSave).toBe(true);
  });

  it("should explicitly preserve the selected network restriction when enabling workspace writes", async () => {
    const { permissions, request } = createSourcePermissionsFixture();
    await permissions.load();
    permissions.setValue("filesystem", "workspace-write");
    request.mockResolvedValueOnce(sourcePermissionSnapshot({ filesystem: "workspace-write" }));

    await permissions.save();

    expect(request.mock.calls[1]![0].patch).toEqual({ filesystem: "workspace-write", networkAccess: false });
  });

  it("should select the equivalent legacy mode explicitly for network changes to a builtin profile", async () => {
    const { permissions, request } = createSourcePermissionsFixture();
    request.mockResolvedValue(sourcePermissionSnapshot({ profileId: ":workspace", filesystem: "workspace-write" }));
    await permissions.load();
    permissions.setValue("networkAccess", true);

    await permissions.save();

    expect(request.mock.calls[1]![0].patch).toEqual({ filesystem: "workspace-write", networkAccess: true });
  });

  it("should preserve protected access even if form state is changed programmatically", async () => {
    const { permissions, request } = createSourcePermissionsFixture();
    request.mockResolvedValue(sourcePermissionSnapshot({ filesystem: "custom", networkAccess: null, profileId: "restricted",
      editable: { filesystem: false, networkAccess: false, approvalPolicy: true, approvalsReviewer: true } }));
    await permissions.load();
    permissions.setValue("filesystem", "workspace-write");
    permissions.setValue("networkAccess", true);
    permissions.setValue("approvalPolicy", "untrusted");

    await permissions.save();

    expect(request.mock.calls[1]![0].patch).toEqual({ approvalPolicy: "untrusted" });
  });

  it("should prevent duplicate writes and success before confirmation", async () => {
    const { permissions, request } = createSourcePermissionsFixture();
    await permissions.load();
    permissions.setValue("approvalsReviewer", "auto_review");
    let finish!: (value: unknown) => void;
    request.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    const pending = permissions.save();

    expect(await permissions.save()).toBe(false);
    expect(permissions.didSave).toBe(false);
    expect(permissions.isSaving).toBe(true);
    finish(sourcePermissionSnapshot({ approvalsReviewer: "auto_review" }));
    await pending;
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("should require a refresh after a rejected or uncertain write", async () => {
    const { permissions, request } = createSourcePermissionsFixture();
    await permissions.load();
    permissions.setValue("approvalsReviewer", "auto_review");
    request.mockRejectedValueOnce(new Error("Source permissions changed"));

    expect(await permissions.save()).toBe(false);

    expect(permissions.error).toBe("Source permissions changed");
    expect(permissions.snapshot).toBeNull();
    expect(permissions.didSave).toBe(false);
    expect(permissions.canEdit).toBe(false);
    await permissions.load();
    expect(permissions.canEdit).toBe(true);
  });

  it("should reject a response from a different source", async () => {
    const { permissions, request } = createSourcePermissionsFixture();
    request.mockResolvedValueOnce(sourcePermissionSnapshot({ sourceId: "different" }));
    await permissions.load();
    expect(permissions.snapshot).toBeNull();
    expect(permissions.error).toBe("Invalid source permission response.");
  });
});
