import { describe, expect, it, vi } from "vitest";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexFileContext, OpenCodexProjectWorkspace } from "@open-codex-ui/opencodex-protocol";
import { WorkspaceDiskUsageService } from "../src/backend/workspaces/WorkspaceDiskUsageService.js";
import type { ProjectSourcePort } from "../src/backend/runtime/runtimePorts.js";
import type { runSourceFileOperation, runLocalFileOperation } from "../src/backend/files/runFileOperation.js";

const values = { logicalBytes: 1024, allocatedBytes: null, fileCount: 1, skippedLinks: 0,
  unreadableEntries: 0, complete: true, limitReached: false };

/** Provides only source resolution and catalogue boundaries; no host filesystem access is involved. */
function fixture(workspacePath = "/remote/checkout") {
  const workspace: OpenCodexProjectWorkspace = { id: "ws", projectId: "project", sourceId: "source",
    path: workspacePath, isPrimary: false, managed: true, removedAt: null };
  const repository = { workspaces: { get: vi.fn(async () => workspace) } } as unknown as OpenCodexCacheRepository;
  const client = {} as CodexAppServerClient;
  const clients = { ensureClient: vi.fn(async () => client) };
  const run = vi.fn<typeof runSourceFileOperation>().mockResolvedValue({ ok: true, value: values });
  const local = vi.fn<typeof runLocalFileOperation>().mockResolvedValue({ ok: true, value: values });
  const sources = { resolveRequestedSource: vi.fn(async () => ({ id: "source", kind: "custom" })) };
  const service = new WorkspaceDiskUsageService(repository, clients,
    sources as unknown as ProjectSourcePort, { source: run, local }, () => "2026-10-22T12:00:00Z");
  const input = { projectId: "project", workspaceId: "ws", sourceId: "source", workspacePath };
  return { service, input, workspace, run, client, clients, sources, local };
}

describe("source-owned workspace disk usage", () => {
  it("should use the bundled worker only for an explicitly local source without requiring Node on PATH", async () => {
    const { service, input, sources, local, run, clients } = fixture("C:\\local\\checkout");
    sources.resolveRequestedSource.mockResolvedValue({ id: "source", kind: "local" });
    expect(await service.read(input)).toMatchObject(values);
    expect(local).toHaveBeenCalledWith({ type: "workspaceDiskUsage", target: { ...input, path: "" } });
    expect(run).not.toHaveBeenCalled();
    expect(clients.ensureClient).not.toHaveBeenCalled();
  });

  it.each(["/remote/checkout", "C:\\sources\\checkout ' $literal", "\\\\server\\share\\checkout"])(
    "should pass source-native paths as data and return a dated observation: %s", async workspacePath => {
      const { service, input, run, client } = fixture(workspacePath);
      expect(await service.read(input)).toEqual({ ...input, ...values, measuredAt: "2026-10-22T12:00:00Z" });
      expect(run).toHaveBeenCalledWith(client, { type: "workspaceDiskUsage", target: { ...input, path: "" } });
    });

  it.each(["project", "source", "path", "removed", "move", "removal"])("should reject %s context before source access", async reason => {
    const { service, input, workspace, run } = fixture();
    if (reason === "project") workspace.projectId = "other";
    if (reason === "source") workspace.sourceId = "other";
    if (reason === "path") workspace.path = "/moved";
    if (reason === "removed") workspace.removedAt = "2026-10-22";
    if (reason === "move") workspace.movePending = true;
    if (reason === "removal") workspace.removalPending = true;
    await expect(service.read(input)).rejects.toThrow(/Workspace|workspace/);
    expect(run).not.toHaveBeenCalled();
  });

  it("should reject a reply if movement started during the measurement", async () => {
    const { service, input, workspace, run } = fixture();
    run.mockImplementation(async () => { workspace.movePending = true; return { ok: true, value: values }; });
    await expect(service.read(input)).rejects.toThrow("pending move");
  });

  it("should refuse malformed requests missing the explicit project identity", async () => {
    const { service, input, run, local } = fixture();
    const malformed: unknown = { ...input, projectId: undefined };
    await expect(service.read(malformed as OpenCodexFileContext)).rejects.toThrow("Workspace context changed");
    expect(run).not.toHaveBeenCalled();
    expect(local).not.toHaveBeenCalled();
  });

  it("should bound concurrency and release slots after failed source operations", async () => {
    const { service, input, run } = fixture();
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    run.mockImplementation(async () => { await waiting; throw new Error("source disconnected"); });
    const first = service.read(input);
    const second = service.read(input);
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await expect(service.read(input)).rejects.toThrow("Two workspace size measurements");
    release();
    expect((await Promise.allSettled([first, second])).map(result => result.status)).toEqual(["rejected", "rejected"]);
    run.mockResolvedValue({ ok: true, value: values });
    expect(await service.read(input)).toMatchObject(values);
  });

  it("should reject malformed measurements rather than trusting source output", async () => {
    const { service, input, run } = fixture();
    run.mockResolvedValue({ ok: true, value: { ...values, logicalBytes: -1 } });
    await expect(service.read(input)).rejects.toThrow("Invalid workspace size measurement");
  });

  it("should surface unavailable source helpers instead of reporting an empty workspace", async () => {
    const { service, input, run } = fixture();
    run.mockResolvedValue({ ok: false, code: "unavailable", details: "Node.js is unavailable on this source." });
    await expect(service.read(input)).rejects.toThrow("Node.js is unavailable on this source.");
  });
});
