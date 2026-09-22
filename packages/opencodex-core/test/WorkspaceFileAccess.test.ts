import { mkdtemp, mkdir, writeFile, readFile, symlink, rm, realpath } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexFileAccess, OpenCodexFileRequest, OpenCodexFileSnapshot,
  OpenCodexFileTarget, OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import { WorkspaceFilesService } from "../src/backend/files/WorkspaceFilesService.js";

let root: string;
let destination: string;
let target: OpenCodexFileTarget;
let settings: OpenCodexSettings;
let persist: ReturnType<typeof vi.fn>;
let service: WorkspaceFilesService;
let repository: OpenCodexCacheRepository;
const sources = { resolveRequestedSource: vi.fn().mockResolvedValue({ kind: "local" }) };
const clients = { ensureClient: vi.fn() };

/** Recreates the service around the persisted JSON representation. */
function createService(): WorkspaceFilesService {
  return new WorkspaceFilesService(repository, sources, clients, {
    get: () => settings,
    update: async patch => {
      await persist(patch);
      settings = JSON.parse(JSON.stringify({ ...settings, ...patch })) as OpenCodexSettings;
      return settings;
    }
  });
}

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "file-access-")));
  const workspacePath = join(root, "workspace");
  destination = join(root, "data");
  await mkdir(workspacePath);
  await mkdir(destination);
  await writeFile(join(destination, "data.txt"), "original");
  await symlink(destination, join(workspacePath, "link"), "junction");
  target = { sourceId: "source", projectId: "project", workspaceId: "ws", workspacePath, path: "link" };
  repository = { workspaces: { get: vi.fn().mockImplementation(async (id: string) => ({
    id, projectId: "project", sourceId: "source", path: workspacePath, removedAt: null
  })) } } as unknown as OpenCodexCacheRepository;
  settings = {} as OpenCodexSettings;
  persist = vi.fn().mockResolvedValue(undefined);
  service = createService();
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

/** Grants access through the public backend boundary rather than injecting worker state. */
async function grant(access: OpenCodexFileAccess) {
  return await service.execute({ type: "workspaceFiles.setLinkAccess", target, destination, access });
}

/** Reads the external text through the workspace-relative symbolic path. */
async function read() {
  return await service.execute({ type: "workspaceFiles.read", target: { ...target, path: "link/data.txt" } });
}

describe("workspace external link permissions", () => {
  it("should classify a blocked directory without permitting its contents to be listed", async () => {
    expect(await service.execute({ type: "workspaceFiles.list", target: { ...target, path: "" } }))
      .toMatchObject({ ok: true, value: [{ name: "link", kind: "directory", linkError: "accessDenied",
        linkAccess: { destination, access: "denied", external: true } }] });
    expect(await service.execute({ type: "workspaceFiles.list", target }))
      .toMatchObject({ ok: false, code: "accessDenied" });
    expect(await read()).toMatchObject({ ok: false, code: "accessDenied" });
  });

  it("should persist read-only access, allow browsing, and reject writes", async () => {
    expect(await grant("readOnly")).toMatchObject({ ok: true });
    service = createService();
    expect(await service.execute({ type: "workspaceFiles.list", target }))
      .toMatchObject({ ok: true, value: [{ name: "data.txt", kind: "file" }] });
    const opened = await read();
    expect(opened).toMatchObject({ ok: true, value: { content: "original", readOnly: true } });
    if (!opened.ok) throw new Error(opened.details);
    const snapshot = opened.value as OpenCodexFileSnapshot;
    expect(await service.execute({ type: "workspaceFiles.save", target: { ...target, path: "link/data.txt" },
      revision: snapshot.revision, bom: false, content: "edited" }))
      .toMatchObject({ ok: false, code: "readOnly" });
    expect(await readFile(join(destination, "data.txt"), "utf8")).toBe("original");
  });

  it("should allow explicit writes and enforce revocation on already opened files", async () => {
    await grant("readWrite");
    const opened = await read();
    if (!opened.ok) throw new Error(opened.details);
    const snapshot = opened.value as OpenCodexFileSnapshot;
    const save: OpenCodexFileRequest = { type: "workspaceFiles.save", target: { ...target, path: "link/data.txt" },
      revision: snapshot.revision, bom: false, content: "edited" };
    expect(await service.execute(save)).toMatchObject({ ok: true });
    expect(await readFile(join(destination, "data.txt"), "utf8")).toBe("edited");
    await grant("denied");
    expect(await service.execute(save)).toMatchObject({ ok: false, code: "accessDenied" });
  });

  it("should isolate grants between workspaces and ignore renderer-injected permissions", async () => {
    await grant("readWrite");
    const foreign = { type: "workspaceFiles.read", target: { ...target, workspaceId: "other", path: "link/data.txt" },
      permissions: settings.fileLinkGrants } as OpenCodexFileRequest;
    expect(await service.execute(foreign)).toMatchObject({ ok: false, code: "accessDenied" });
  });

  it("should refuse stale consent when a link changes destination", async () => {
    await grant("readOnly");
    persist.mockClear();
    const replacement = join(root, "replacement");
    await mkdir(replacement);
    await rm(join(target.workspacePath, "link"));
    await symlink(replacement, join(target.workspacePath, "link"), "junction");
    expect(await read()).toMatchObject({ ok: false, code: "accessDenied" });
    expect(await grant("readWrite")).toMatchObject({ ok: false, code: "conflict" });
    expect(persist).not.toHaveBeenCalled();
  });

  it("should not authorize a nested link into a different external destination", async () => {
    await mkdir(join(root, "private"));
    await symlink(join(root, "private"), join(destination, "nested"), "junction");
    await grant("readWrite");
    expect(await service.execute({ type: "workspaceFiles.list", target: { ...target, path: "link/nested" } }))
      .toMatchObject({ ok: false, code: "accessDenied" });
  });

  it("should not let a nested writable grant bypass a read-only parent", async () => {
    const nested = join(root, "nested");
    await mkdir(nested);
    await writeFile(join(nested, "text.txt"), "original");
    await symlink(nested, join(destination, "nested"), "junction");
    await grant("readOnly");
    expect(await service.execute({ type: "workspaceFiles.setLinkAccess",
      target: { ...target, path: "link/nested" }, destination: nested, access: "readWrite" }))
      .toMatchObject({ ok: true });
    const nestedTarget = { ...target, path: "link/nested/text.txt" };
    const opened = await service.execute({ type: "workspaceFiles.read", target: nestedTarget });
    expect(opened).toMatchObject({ ok: true, value: { readOnly: true } });
    if (!opened.ok) throw new Error(opened.details);
    expect(await service.execute({ type: "workspaceFiles.save", target: nestedTarget,
      revision: (opened.value as OpenCodexFileSnapshot).revision, bom: false, content: "edited" }))
      .toMatchObject({ ok: false, code: "readOnly" });
  });

  it("should retain the previous permissions when settings persistence fails", async () => {
    await grant("readOnly");
    persist.mockRejectedValueOnce(new Error("Disk full"));
    expect(await grant("readWrite")).toMatchObject({ ok: false, code: "unavailable" });
    expect(await read()).toMatchObject({ ok: true, value: { readOnly: true } });
  });

  it("should keep concurrent grants without losing unrelated workspace settings", async () => {
    await mkdir(join(root, "second"));
    await symlink(join(root, "second"), join(target.workspacePath, "second"), "junction");
    await Promise.all([grant("readOnly"), service.execute({ type: "workspaceFiles.setLinkAccess",
      target: { ...target, path: "second" }, destination: join(root, "second"), access: "readWrite" })]);
    expect(settings.fileLinkGrants).toHaveLength(2);
  });
});
