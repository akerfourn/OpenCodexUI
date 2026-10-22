import { describe, expect, it } from "vitest";
import { matchingWorkspaceActivity, workspaceManagementStatus, type WorkspaceManagementInput } from
  "../src/stores/project/workspaceManagement";

/** Uses a fixed clock and complete matching evidence for a managed, old secondary checkout. */
function fixture(): WorkspaceManagementInput {
  return { workspace: { id: "B", projectId: "project", sourceId: "source", path: "/B", isPrimary: false,
    managed: true, removedAt: null, workStatus: "completed", completedAt: "2026-01-02T00:00:00Z" }, activity: { workspaceId: "B", sourceId: "source", workspacePath: "/B",
    lastActivityAt: "2026-01-01T00:00:00Z", conversationCount: 1, activeConversationCount: 0, pendingOperationCount: 0 },
    lock: { workspaceId: "B", sourceId: "source", workspacePath: "/B", supported: true, lockedReason: null },
    hasLocalActivity: false, hasUnsavedDocuments: false, sourceAvailable: true, checking: false,
    retentionDays: 30, now: Date.parse("2026-10-22T12:00:00Z") };
}

describe("advisory workspace cleanup classification", () => {
  it("should retain active and legacy workspaces regardless of their age", () => {
    const input = fixture();
    input.workspace.workStatus = "active";
    input.workspace.completedAt = null;
    expect(workspaceManagementStatus(input)).toBe("inProgress");
    delete input.workspace.workStatus;
    expect(workspaceManagementStatus(input)).toBe("inProgress");
  });

  it("should restart the retention delay at completion or later known activity", () => {
    const input = fixture();
    input.workspace.completedAt = "2026-10-21T00:00:00Z";
    expect(workspaceManagementStatus(input)).toBe("recent");
    input.workspace.completedAt = "2026-01-02T00:00:00Z";
    input.activity!.lastActivityAt = "2026-10-21T00:00:00Z";
    expect(workspaceManagementStatus(input)).toBe("recent");
    input.activity!.lastActivityAt = "2026-01-01T00:00:00Z";
    expect(workspaceManagementStatus(input)).toBe("candidate");
  });

  it("should disable suggestions without ignoring activity or lock guards", () => {
    const input = fixture();
    input.retentionDays = null;
    expect(workspaceManagementStatus(input)).toBe("retained");
    input.lock!.lockedReason = "Keep";
    expect(workspaceManagementStatus(input)).toBe("locked");
  });

  it.each([null, "invalid", "2099-01-01T00:00:00Z"])("should retain uncertain completion dates: %s", date => {
    const input = fixture();
    input.workspace.completedAt = date;
    expect(workspaceManagementStatus(input)).toBe("activityUnknown");
  });

  it.each([0, -1, 1.5, 3651, NaN, Infinity])("should refuse an invalid retention delay: %s", days => {
    const input = fixture();
    input.retentionDays = days;
    expect(workspaceManagementStatus(input)).toBe("activityUnknown");
  });

  it("should suggest only inspection of an old managed checkout with matching unlocked source evidence", () => {
    expect(workspaceManagementStatus(fixture())).toBe("candidate");
  });

  it.each(["primary", "imported", "removed", "pending", "busy", "offline", "lockUnknown", "locked", "activityUnknown", "recent"])(
    "should exclude a workspace whose status is %s", status => {
      const input = fixture();
      if (status === "primary") input.workspace.isPrimary = true;
      if (status === "imported") input.workspace.managed = false;
      if (status === "removed") input.workspace.removedAt = "2026-10-01";
      if (status === "pending") input.workspace.movePending = true;
      if (status === "busy") input.hasUnsavedDocuments = true;
      if (status === "offline") input.sourceAvailable = false;
      if (status === "lockUnknown") input.lock = undefined;
      if (status === "locked") input.lock!.lockedReason = "";
      if (status === "activityUnknown") input.activity!.lastActivityAt = null;
      if (status === "recent") input.activity!.lastActivityAt = "2026-10-21T00:00:00Z";
      expect(workspaceManagementStatus(input)).toBe(status);
    }
  );

  it("should respect the chosen inactivity threshold and include its exact boundary", () => {
    const input = fixture();
    input.activity!.lastActivityAt = "2026-09-22T12:00:00Z";
    expect(workspaceManagementStatus(input)).toBe("candidate");
    input.retentionDays = 90;
    expect(workspaceManagementStatus(input)).toBe("recent");
  });

  it("should include the exact completion deadline even when the activity is older", () => {
    const input = fixture();
    input.workspace.completedAt = "2026-09-22T12:00:00Z";
    expect(workspaceManagementStatus(input)).toBe("candidate");
    input.workspace.completedAt = "2026-09-22T12:00:00.001Z";
    expect(workspaceManagementStatus(input)).toBe("recent");
  });

  it("should exclude cached active agents, unresolved reservations and local tool activity", () => {
    const input = fixture();
    input.activity!.activeConversationCount = 1;
    expect(workspaceManagementStatus(input)).toBe("busy");
    input.activity!.activeConversationCount = 0;
    input.activity!.pendingOperationCount = 1;
    expect(workspaceManagementStatus(input)).toBe("busy");
    input.activity!.pendingOperationCount = 0;
    input.hasLocalActivity = true;
    expect(workspaceManagementStatus(input)).toBe("busy");
  });

  it("should discard late lock and activity evidence after a source or path changes", () => {
    const input = fixture();
    input.workspace.sourceId = "other-source";
    expect(matchingWorkspaceActivity(input.workspace, input.activity)).toBeUndefined();
    expect(workspaceManagementStatus(input)).toBe("lockUnknown");
    input.workspace.sourceId = "source";
    input.activity!.workspacePath = "/old/B";
    expect(workspaceManagementStatus(input)).toBe("activityUnknown");
  });

  it.each(["invalid", "2099-01-01T00:00:00Z"])("should not turn an invalid or future timestamp into a candidate: %s", date => {
    const input = fixture();
    input.activity!.lastActivityAt = date;
    expect(workspaceManagementStatus(input)).toBe("activityUnknown");
  });
});
