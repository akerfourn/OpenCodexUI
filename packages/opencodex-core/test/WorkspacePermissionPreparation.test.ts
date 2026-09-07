import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexCacheRepository, WorkspaceTransitionRecord } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { WorkspacePermissionPreparation } from "../src/backend/workspaces/WorkspacePermissionPreparation";
import { workspacePermissionInput } from "../src/backend/workspaces/workspacePermissionProfile";
import { buildManagedPermissionProfile } from "../src/backend/projects/projectContextConfig";

/** Stable reservation and explicit caller approval policy, independent of time or random identifiers. */
const transition: WorkspaceTransitionRecord = {
  id: "transition", threadId: "thread", projectId: "project", sourceId: "source",
  fromWorkspaceId: "A", toWorkspaceId: "B", fromPath: "/A", toPath: "/B",
  state: "preparing", expectationJson: null
};
const approval = { approvalPolicy: "never", approvalsReviewer: "user" } as const;

describe("workspace permission preparation", () => {
  const project = { id: "project", sourceId: "source", preferences: { context: {
    folders: [{ id: "docs", path: "/shared", label: null, enabled: true,
      permission: "write" as const, envFilePermission: "deny" as const }]
  } } };
  const client = { createDirectory: vi.fn(), getMetadata: vi.fn(), readFile: vi.fn(), writeFile: vi.fn(), request: vi.fn() };
  const clients = { ensureClient: vi.fn() };
  const getForThread = vi.fn();
  const listProjects = vi.fn();
  const updateProjectPreferences = vi.fn();
  let service: WorkspacePermissionPreparation;

  beforeEach(() => {
    vi.resetAllMocks();
    getForThread.mockResolvedValue(transition);
    listProjects.mockResolvedValue([project]);
    clients.ensureClient.mockResolvedValue(client as unknown as CodexAppServerClient);
    client.getMetadata.mockResolvedValue({ isDirectory: true, isSymlink: false });
    client.readFile.mockResolvedValue({ dataBase64: Buffer.from('model = "kept"\n').toString("base64") });
    const input = workspacePermissionInput(transition, project.preferences.context.folders);
    const profile = buildManagedPermissionProfile(input);
    client.request.mockResolvedValue({ config: {
      default_permissions: input.profileId,
      permissions: { [input.profileId]: { ...profile,
        filesystem: { ...profile.filesystem, glob_scan_max_depth: null },
        network: { ...profile.network, domains: null, proxy_url: null }
      } }
    } });
    service = new WorkspacePermissionPreparation({
      workspaces: { transitions: { getForThread } }, listProjects, updateProjectPreferences
    } as unknown as OpenCodexCacheRepository, clients);
  });

  it("should materialize and verify exact source-local rules without changing primary preferences", async () => {
    const expected = await service.prepare(transition, approval);
    expect(clients.ensureClient).toHaveBeenCalledWith("source");
    expect(client.writeFile).toHaveBeenCalledWith("/B/.codex/config.toml", expect.any(String));
    const config = Buffer.from(client.writeFile.mock.calls[0][1], "base64").toString("utf8");
    expect(config).toContain('model = "kept"');
    expect(config).toContain('"/B" = true');
    expect(config).not.toContain('"/A"');
    expect(config).toContain('"/shared/**/*.env" = "deny"');
    expect(config).toContain('":slash_tmp" = "read"');
    expect(expected.sandbox).toMatchObject({ writableRoots: ["/shared"], networkAccess: false, excludeSlashTmp: true });
    expect(expected.approvalPolicy).toBe("never");
    expect(expected.config).toHaveProperty(`permissions.${expected.activePermissionProfile.id}`);
    expect(updateProjectPreferences).not.toHaveBeenCalled();
  });

  it("should avoid rewriting an identical managed configuration", async () => {
    await service.prepare(transition, approval);
    client.readFile.mockResolvedValue({ dataBase64: client.writeFile.mock.calls[0][1] });
    await service.prepare(transition, approval);
    expect(client.writeFile).toHaveBeenCalledTimes(1);
  });

  it("should refuse stale reservations before source access", async () => {
    getForThread.mockResolvedValue(null);
    await expect(service.prepare(transition, approval)).rejects.toThrow("current durable");
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it("should refuse changed recovery permissions before modifying files", async () => {
    const pending = { ...transition, state: "uncertain" as const, expectationJson: "{}" };
    getForThread.mockResolvedValue(pending);
    await expect(service.prepare(pending, approval)).rejects.toThrow("contract changed");
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it.each(["missing", "network", "extra-root", "extra-rule"])("should refuse effective configuration mismatch: %s", async (kind) => {
    const input = workspacePermissionInput(transition, project.preferences.context.folders);
    const profile = buildManagedPermissionProfile(input);
    if (kind === "network") profile.network = { enabled: true };
    if (kind === "extra-root") profile.workspace_roots["/A"] = true;
    if (kind === "extra-rule") profile.filesystem["/A"] = "write";
    client.request.mockResolvedValue({ config: {
      default_permissions: input.profileId, permissions: kind === "missing" ? {} : { [input.profileId]: profile }
    } });
    await expect(service.prepare(transition, approval)).rejects.toThrow("exact destination permission");
  });

  it("should preserve unmanaged default permissions without writing over them", async () => {
    client.readFile.mockResolvedValue({ dataBase64: Buffer.from('default_permissions = ":read-only"\n').toString("base64") });
    await expect(service.prepare(transition, approval)).rejects.toThrow("outside OpenCodexUI");
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it("should propagate filesystem access failures instead of treating them as missing files", async () => {
    client.readFile.mockRejectedValue(new Error("Permission denied"));
    await expect(service.prepare(transition, approval)).rejects.toThrow("Permission denied");
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it("should not overwrite config when an older server lacks the file-reading RPC", async () => {
    client.readFile.mockRejectedValue(new Error("Method not found"));
    await expect(service.prepare(transition, approval)).rejects.toThrow("Method not found");
    expect(client.writeFile).not.toHaveBeenCalled();
  });

  it("should create the managed config when the source explicitly reports a missing file", async () => {
    client.readFile.mockRejectedValue(new Error("No such file or directory"));
    await expect(service.prepare(transition, approval)).resolves.toMatchObject({ cwd: "/B" });
    expect(client.writeFile).toHaveBeenCalledTimes(1);
  });
});

describe("workspace-specific permission identities", () => {
  const shared = { id: "shared", path: "/shared", label: null, enabled: true };

  it("should ignore labels and order but change identity with the source, workspace or policy", () => {
    const other = { ...shared, path: "/docs" };
    const first = workspacePermissionInput(transition, [shared, other]);
    expect(workspacePermissionInput(transition, [other, { ...shared, label: "renamed" }]).profileId).toBe(first.profileId);
    expect(workspacePermissionInput({ ...transition, sourceId: "other-source" }, [shared, other]).profileId).not.toBe(first.profileId);
    expect(workspacePermissionInput({ ...transition, toWorkspaceId: "C" }, [shared, other]).profileId).not.toBe(first.profileId);
    expect(workspacePermissionInput(transition, [{ ...shared, permission: "write" }, other]).profileId).not.toBe(first.profileId);
  });

  it.each(["/", "/A", "/A/child", "/B", "/B/child", "relative", "/shared/*"])("should reject unsafe or ambiguous context path %s", (folderPath) => {
    expect(() => workspacePermissionInput(transition, [{ ...shared, path: folderPath }])).toThrow();
  });

  it("should reject nested workspaces and case-insensitive Windows overlap", () => {
    expect(() => workspacePermissionInput({ ...transition, toPath: "/A/B" }, [])).toThrow("non-nested");
    expect(() => workspacePermissionInput({ ...transition, fromPath: "C:\\Repo", toPath: "C:\\Other" },
      [{ ...shared, path: "c:\\repo\\child" }])).toThrow("overlaps");
  });

  it("should reject duplicate conflicting folder permissions", () => {
    expect(() => workspacePermissionInput(transition, [shared, { ...shared, permission: "write" }]))
      .toThrow("Conflicting permissions");
  });
});
