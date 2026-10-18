import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import { SourcePermissionsService } from "../src/backend/sources/SourcePermissionsService";
import { describeSourcePermissions } from "../src/backend/sources/sourcePermissionMapping";

/** Native user configuration in the source's filesystem, independent of the host. */
function configResponse(): v2.ConfigReadResponse {
  return { config: { sandbox_mode: "read-only", approval_policy: "on-request", approvals_reviewer: "user",
    default_permissions: null, model: "keep-model", sandbox_workspace_write: {
      writable_roots: ["/native/shared"], network_access: false, exclude_tmpdir_env_var: true, exclude_slash_tmp: false
    } }, origins: {}, layers: [{ name: { type: "user", file: "/native/home/config.toml", profile: null },
      version: "version-1", config: {}, disabledReason: null }] } as unknown as v2.ConfigReadResponse;
}

/** Complete enough source metadata to verify identity and transport ownership. */
function localSource(id = "source-a"): CachedSource {
  return { id, name: id, kind: "local", settings: { color: "blue", commandMode: "auto", command: null,
    openFileCommand: null, openFolderCommand: null }, createdAt: "fixed", updatedAt: "fixed",
    lastDetectedCodexVersion: null, lastDetectedCodexAt: null, lastDetectionError: null };
}

describe("source permission defaults", () => {
  let config: v2.ConfigReadResponse;
  let requirements: v2.ConfigRequirements | null;
  let source: CachedSource;
  let service: SourcePermissionsService;
  let applyWrites: boolean;
  const request = vi.fn();
  const ensureClient = vi.fn();
  const resolveRequestedSource = vi.fn();
  const getClient = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    config = configResponse();
    requirements = null;
    source = localSource();
    applyWrites = true;
    request.mockImplementation(async (method: string, params: v2.ConfigBatchWriteParams) => {
      if (method === "config/read") return structuredClone(config);
      if (method === "configRequirements/read") return { requirements: structuredClone(requirements) };
      if (method !== "config/batchWrite") throw new Error(`Unexpected RPC: ${method}`);
      if (params.expectedVersion !== config.layers![0]!.version) throw new Error("Config version changed");
      if (applyWrites) {
        for (const edit of params.edits) {
          if (edit.keyPath === "sandbox_workspace_write.network_access") {
            config.config.sandbox_workspace_write!.network_access = edit.value as boolean;
          } else {
            (config.config as Record<string, unknown>)[edit.keyPath] = edit.value;
          }
        }
        config.layers![0]!.version = "version-2";
      }
      return { status: "ok", version: "version-2", filePath: "/native/home/config.toml", overriddenMetadata: null };
    });
    ensureClient.mockResolvedValue({ request } as unknown as CodexAppServerClient);
    resolveRequestedSource.mockImplementation(async () => source);
    service = new SourcePermissionsService({ resolveRequestedSource }, { ensureClient, getClient }, null);
  });

  /** Reads through the production source validation and native mapping. */
  async function read() { return await service.execute({ type: "sourcePermissions.read", sourceId: "source-a" }); }

  it("should read the source defaults and requirements without project context or writes", async () => {
    const snapshot = await read();

    expect(snapshot).toMatchObject({ sourceId: "source-a", configPath: "/native/home/config.toml",
      filesystem: "read-only", networkAccess: false, approvalsReviewer: "user", approvalPolicy: "on-request" });
    expect(ensureClient).toHaveBeenCalledWith("source-a");
    expect(request.mock.calls).toEqual([["config/read", { includeLayers: true }], ["configRequirements/read", {}]]);
  });

  it("should atomically change defaults without reloading current chats or replacing unrelated settings", async () => {
    const snapshot = await read();
    const confirmed = await service.execute({ type: "sourcePermissions.change", sourceId: "source-a", revision: snapshot.revision,
      patch: { filesystem: "workspace-write", networkAccess: true, approvalsReviewer: "auto_review" } });

    expect(request).toHaveBeenCalledWith("config/batchWrite", { expectedVersion: "version-1", reloadUserConfig: false,
      edits: [{ keyPath: "sandbox_mode", value: "workspace-write", mergeStrategy: "upsert" },
        { keyPath: "sandbox_workspace_write.network_access", value: true, mergeStrategy: "upsert" },
        { keyPath: "approvals_reviewer", value: "auto_review", mergeStrategy: "upsert" }] });
    expect(confirmed).toMatchObject({ filesystem: "workspace-write", networkAccess: true, approvalsReviewer: "auto_review" });
    expect(config.config.model).toBe("keep-model");
    expect(config.config.approval_policy).toBe("on-request");
    expect(config.config.sandbox_workspace_write).toMatchObject({ writable_roots: ["/native/shared"],
      exclude_tmpdir_env_var: true, exclude_slash_tmp: false });
  });

  it("should tolerate omitted disabledReason on the installed native API", async () => {
    delete (config.layers![0] as Partial<v2.ConfigLayer>).disabledReason;
    await expect(read()).resolves.toMatchObject({ filesystem: "read-only" });
  });

  it("should compare native map contents independently of key insertion order", async () => {
    const first = await read();
    config.config = Object.fromEntries(Object.entries(config.config).reverse()) as v2.Config;

    await expect(service.execute({ type: "sourcePermissions.change", sourceId: "source-a", revision: first.revision,
      patch: { approvalsReviewer: "auto_review" } })).resolves.toMatchObject({ approvalsReviewer: "auto_review" });
  });

  it("should reject stale revisions before writing", async () => {
    const snapshot = await read();
    config.config.model = "changed-elsewhere";

    await expect(service.execute({ type: "sourcePermissions.change", sourceId: "source-a", revision: snapshot.revision,
      patch: { approvalsReviewer: "auto_review" } })).rejects.toThrow("changed. Refresh");
    expect(request.mock.calls.some(([method]) => method === "config/batchWrite")).toBe(false);
  });

  it("should preserve a custom profile while allowing reviewer-only changes", async () => {
    config.config.sandbox_mode = null;
    config.config.default_permissions = "restricted";
    const snapshot = await read();
    expect(snapshot).toMatchObject({ filesystem: "custom", profileId: "restricted", editable: { filesystem: false, networkAccess: false } });

    await service.execute({ type: "sourcePermissions.change", sourceId: "source-a", revision: snapshot.revision,
      patch: { approvalsReviewer: "auto_review" } });

    expect(request).toHaveBeenCalledWith("config/batchWrite", expect.objectContaining({
      edits: [{ keyPath: "approvals_reviewer", value: "auto_review", mergeStrategy: "upsert" }]
    }));
    expect(config.config.default_permissions).toBe("restricted");
  });

  it.each(["custom", "managed", "session", "profile"])("should reject replacing protected %s access", async (kind) => {
    if (kind === "custom") config.config.default_permissions = "restricted";
    if (kind === "managed") requirements = { allowedSandboxModes: ["read-only"] } as v2.ConfigRequirements;
    if (kind === "session") config.origins.sandbox_mode = { name: { type: "sessionFlags" }, version: "fixed" };
    if (kind === "profile") config.origins.sandbox_mode = {
      name: { type: "user", file: "/native/profiles/work/config.toml", profile: "work" }, version: "fixed"
    };
    const snapshot = await read();

    await expect(service.execute({ type: "sourcePermissions.change", sourceId: "source-a", revision: snapshot.revision,
      patch: { filesystem: "workspace-write" } })).rejects.toThrow();
    expect(request.mock.calls.some(([method]) => method === "config/batchWrite")).toBe(false);
  });

  it("should expose administrator-allowed policies and reviewers", async () => {
    requirements = { allowedApprovalPolicies: ["on-request"], allowedApprovalsReviewers: ["user"] } as v2.ConfigRequirements;
    const snapshot = await read();

    expect(snapshot.allowedPolicies).toEqual(["on-request"]);
    expect(snapshot.allowedReviewers).toEqual(["user"]);
    await expect(service.execute({ type: "sourcePermissions.change", sourceId: "source-a", revision: snapshot.revision,
      patch: { approvalsReviewer: "auto_review" } })).rejects.toThrow("Unsupported approval reviewer");
  });

  it("should report unspecified defaults honestly rather than inventing a workspace or policy", async () => {
    config.config.sandbox_mode = null;
    config.config.approval_policy = null;
    config.config.approvals_reviewer = null;
    await expect(read()).resolves.toMatchObject({ filesystem: "inherited", networkAccess: null,
      approvalPolicy: "inherited", approvalsReviewer: "inherited" });
  });

  it.each(["empty", "different"])("should refuse an %s source identity before contacting Codex", async (kind) => {
    if (kind === "different") source.id = "other-source";
    await expect(service.execute({ type: "sourcePermissions.read", sourceId: kind === "empty" ? "" : "source-a" })).rejects.toThrow();
    expect(ensureClient).not.toHaveBeenCalled();
  });

  it("should not claim success when native values remain unchanged", async () => {
    const snapshot = await read();
    applyWrites = false;
    await expect(service.execute({ type: "sourcePermissions.change", sourceId: "source-a", revision: snapshot.revision,
      patch: { approvalsReviewer: "auto_review" } })).rejects.toThrow("did not confirm");
  });

  it("should detect sharing only between connected sources in the same filesystem space", async () => {
    const peer = { request: vi.fn(async () => configResponse()) } as unknown as CodexAppServerClient;
    const remote = { ...localSource("remote"), kind: "ssh", settings: { host: "elsewhere", user: "someone", port: 22 } } as CachedSource;
    getClient.mockReturnValue(peer);
    service = new SourcePermissionsService({ resolveRequestedSource }, { ensureClient, getClient },
      { listSources: async () => [source, localSource("same-home"), remote] });

    expect((await read()).sharedSourceIds).toEqual(["same-home"]);
    expect(getClient).not.toHaveBeenCalledWith("remote");
    expect(ensureClient).toHaveBeenCalledTimes(1);
  });

  it("should keep configuration revisions stable when nested origin maps are reordered", () => {
    config.origins = { sandbox_mode: { name: { type: "system", file: "/system/config.toml" }, version: "one" },
      approval_policy: { name: { type: "system", file: "/system/config.toml" }, version: "two" } };
    const first = describeSourcePermissions("source-a", config, null, source.settings);
    config.origins = Object.fromEntries(Object.entries(config.origins).reverse());
    expect(describeSourcePermissions("source-a", config, null, source.settings).revision).toBe(first.revision);
  });

  it("should serialize simultaneous saves so the second cannot silently overwrite a newer configuration", async () => {
    const snapshot = await read();
    const results = await Promise.allSettled([
      service.execute({ type: "sourcePermissions.change", sourceId: "source-a", revision: snapshot.revision,
        patch: { approvalsReviewer: "auto_review" } }),
      service.execute({ type: "sourcePermissions.change", sourceId: "source-a", revision: snapshot.revision,
        patch: { approvalPolicy: "never" } })
    ]);

    expect(results.map(result => result.status)).toEqual(["fulfilled", "rejected"]);
    expect(request.mock.calls.filter(([method]) => method === "config/batchWrite")).toHaveLength(1);
    expect(config.config.approval_policy).toBe("on-request");
  });

  it("should not enable networking when administrator requirements exclude workspace writes", async () => {
    requirements = { allowedSandboxModes: ["read-only"] } as v2.ConfigRequirements;
    expect((await read()).editable.networkAccess).toBe(false);
  });

  it("should ignore inactive legacy networking when a builtin profile selects workspace access", async () => {
    config.config.sandbox_mode = null;
    config.config.default_permissions = ":workspace";
    config.config.sandbox_workspace_write!.network_access = true;
    expect(await read()).toMatchObject({ filesystem: "workspace-write", networkAccess: false });
  });
});
