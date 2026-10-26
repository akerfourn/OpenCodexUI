import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenCodexSqliteCacheRepository } from "@open-codex-ui/opencodex-cache";
import { PrimaryWorkspaceMoveService } from "../src/backend/workspaces/PrimaryWorkspaceMoveService";
import { primaryMoveFixture } from "./primaryMoveFixtures";

let fixture: Awaited<ReturnType<typeof primaryMoveFixture>>;
afterEach(async () => { if (fixture !== undefined) await fixture.dispose(); });

describe("durable primary project directory movement", () => {
  it("should preserve local files, identity and external Git worktrees while updating project paths", async () => {
    fixture = await primaryMoveFixture();
    const { primary, cache, main, external, destination, git, input, service } = fixture;
    await cache.workspaces.registerDiscovered(primary.id, "source", main, [external]);
    const secondary = (await cache.workspaces.list(primary.projectId)).find(item => !item.isPrimary)!;
    fs.writeFileSync(path.join(main, "tracked.txt"), "edited");
    fs.writeFileSync(path.join(main, "local.txt"), "local");
    fs.writeFileSync(path.join(main, ".gitignore"), "ignored.txt\n");
    fs.writeFileSync(path.join(main, "ignored.txt"), "ignored");
    await service.move(input);
    expect(fs.existsSync(main)).toBe(false);
    expect(fs.readFileSync(path.join(destination, "tracked.txt"), "utf8")).toBe("edited");
    expect(fs.readFileSync(path.join(destination, "local.txt"), "utf8")).toBe("local");
    expect(fs.readFileSync(path.join(destination, "ignored.txt"), "utf8")).toBe("ignored");
    expect(await cache.workspaces.get(primary.id)).toMatchObject({ id: primary.id, path: destination, isPrimary: true, workStatus: "active" });
    expect((await cache.listProjects()).find(project => project.id === primary.projectId)?.path).toBe(destination);
    expect((await cache.workspaces.get(secondary.id))?.path).toBe(external);
    expect(git(external, "rev-parse", "--git-common-dir").trim()).toBe(path.join(destination, ".git"));
    expect(await cache.workspaces.listPathAliases(primary.id)).toContain(main);
    expect(await service.pending(primary.projectId)).toEqual([]);
  });

  it("should repair unimported and nested worktrees and atomically publish nested workspace aliases", async () => {
    fixture = await primaryMoveFixture();
    const { cache, primary, main, destination, git } = fixture;
    const nested = path.join(main, "nested");
    git(main, "worktree", "add", "-b", "nested", nested);
    await cache.workspaces.registerDiscovered(primary.id, "source", main, [nested]);
    const member = (await cache.workspaces.list(primary.projectId)).find(item => !item.isPrimary)!;
    await fixture.service.move(fixture.input);
    expect((await cache.workspaces.get(member.id))?.path).toBe(path.join(destination, "nested"));
    expect(await cache.workspaces.listPathAliases(member.id)).toContain(nested);
    expect(git(path.join(destination, "nested"), "rev-parse", "--show-toplevel").trim()).toBe(path.join(destination, "nested"));
    expect(git(fixture.external, "rev-parse", "--git-common-dir").trim()).toBe(path.join(destination, ".git"));
  });

  it("should move a non-Git project's directory without requiring Git", async () => {
    fixture = await primaryMoveFixture({ nonGit: true });
    await fixture.service.move(fixture.input);
    expect(fs.readFileSync(path.join(fixture.destination, "tracked.txt"), "utf8")).toBe("initial");
    expect((await fixture.cache.workspaces.get(fixture.primary.id))?.path).toBe(fixture.destination);
  });

  it("should move a primary that is itself a linked worktree without moving the common repository", async () => {
    fixture = await primaryMoveFixture({ linkedPrimary: true });
    await fixture.service.move(fixture.input);
    expect(fs.existsSync(fixture.main)).toBe(true);
    expect(fixture.git(fixture.destination, "rev-parse", "--git-common-dir").trim()).toBe(path.join(fixture.main, ".git"));
    expect(fixture.git(fixture.main, "worktree", "list")).toContain(fixture.destination);
  });

  it("should recover a lost rename response after reopening SQLite without renaming again", async () => {
    fixture = await primaryMoveFixture();
    const original = fixture.files.rename.bind(fixture.files);
    const rename = vi.spyOn(fixture.files, "rename").mockImplementation(async move => { await original(move); throw new Error("reply lost"); });
    await expect(fixture.service.move(fixture.input)).rejects.toThrow("reply lost");
    const move = (await fixture.service.pending(fixture.primary.projectId))[0]!;
    expect(move).toMatchObject({ state: "uncertain", primarySnapshot: { identity: expect.any(String) } });
    expect((await fixture.cache.workspaces.get(fixture.primary.id))?.movePending).toBe(true);
    await fixture.closeCache();
    const reopened = createOpenCodexSqliteCacheRepository({ directory: fixture.cacheDirectory });
    try {
      const recovered = new PrimaryWorkspaceMoveService(reopened.workspaces, fixture.clients, fixture.gate,
        fixture.inactive, () => [], fixture.files, fixture.gitMove);
      await recovered.reconcile(move.id);
      expect((await reopened.workspaces.get(fixture.primary.id))?.path).toBe(fixture.destination);
      expect(await reopened.workspaces.moves.list(fixture.primary.projectId)).toEqual([]);
      expect(rename).toHaveBeenCalledOnce();
    } finally { await reopened.close(); }
  });

  it("should resume failed Git repair without repeating the directory movement", async () => {
    fixture = await primaryMoveFixture();
    const repair = vi.spyOn(fixture.gitMove, "repairAndVerify").mockRejectedValueOnce(new Error("repair interrupted"));
    const rename = vi.spyOn(fixture.files, "rename");
    await expect(fixture.service.move(fixture.input)).rejects.toThrow("repair interrupted");
    const move = (await fixture.service.pending(fixture.primary.projectId))[0]!;
    expect(move.gitExitCode).toBe(0);
    await fixture.service.reconcile(move.id);
    expect(repair).toHaveBeenCalledTimes(2);
    expect(rename).toHaveBeenCalledOnce();
  });

  it("should recover after Git links were already repaired but SQLite publication failed", async () => {
    fixture = await primaryMoveFixture();
    vi.spyOn(fixture.cache.workspaces.moves, "commit").mockRejectedValueOnce(new Error("cache publication failed"));
    const rename = vi.spyOn(fixture.files, "rename");
    await expect(fixture.service.move(fixture.input)).rejects.toThrow("cache publication failed");
    const move = (await fixture.service.pending(fixture.primary.projectId))[0]!;
    expect(fixture.git(fixture.external, "rev-parse", "--git-common-dir").trim()).toBe(path.join(fixture.destination, ".git"));
    await fixture.service.reconcile(move.id);
    expect(rename).toHaveBeenCalledOnce();
    expect((await fixture.cache.workspaces.get(fixture.primary.id))?.path).toBe(fixture.destination);
  });

  it("should accept configured storage only when explicitly selected for the principal", async () => {
    fixture = await primaryMoveFixture({ nonGit: true });
    const { destinationPath: _destination, ...input } = fixture.input;
    await expect(fixture.service.move(input)).rejects.toThrow("explicit destination");
    await fixture.service.move({ ...input, rootId: "storage" });
    expect((await fixture.cache.workspaces.get(fixture.primary.id))?.path)
      .toBe(path.join(fixture.storage, fixture.primary.projectId, fixture.primary.id));
  });

  it("should refuse submodules before dispatching directory movement", async () => {
    fixture = await primaryMoveFixture();
    const head = fixture.git(fixture.main, "rev-parse", "HEAD").trim();
    fs.writeFileSync(path.join(fixture.main, ".gitmodules"), '[submodule "module"]\n path = module\n url = /unused\n');
    fixture.git(fixture.main, "update-index", "--add", "--cacheinfo", `160000,${head},module`);
    const rename = vi.spyOn(fixture.files, "rename");
    await expect(fixture.service.move(fixture.input)).rejects.toThrow("submodules");
    expect(rename).not.toHaveBeenCalled();
    expect(fs.existsSync(fixture.main)).toBe(true);
  });

  it("should refuse to repair Git links into a replacement directory after a lost response", async () => {
    fixture = await primaryMoveFixture();
    const before = fs.readFileSync(path.join(fixture.external, ".git"), "utf8");
    const original = fixture.files.rename.bind(fixture.files);
    const rename = vi.spyOn(fixture.files, "rename").mockImplementation(async move => {
      const result = await original(move);
      fs.renameSync(fixture.destination, path.join(fixture.directory, "actual-moved-directory"));
      fs.mkdirSync(fixture.destination);
      return result;
    });
    await expect(fixture.service.move(fixture.input)).rejects.toThrow("identity");
    const move = (await fixture.service.pending(fixture.primary.projectId))[0]!;
    await expect(fixture.service.reconcile(move.id)).rejects.toThrow("identity");
    expect(fs.readFileSync(path.join(fixture.external, ".git"), "utf8")).toBe(before);
    expect(rename).toHaveBeenCalledOnce();
  });

  it.each(["occupied", "nested", "stale", "locked", "busy"])("should reject %s state without moving files", async state => {
    fixture = await primaryMoveFixture();
    if (state === "occupied") { fs.mkdirSync(fixture.destination); fs.writeFileSync(path.join(fixture.destination, "keep"), "keep"); }
    if (state === "nested") fixture.input.destinationPath = path.join(fixture.main, "invalid");
    if (state === "stale") fixture.input.expectedPath = "/old";
    if (state === "locked") fixture.git(fixture.main, "worktree", "lock", fixture.external);
    if (state === "busy") fixture.inactive.mockRejectedValue(new Error("Stop commands"));
    await expect(fixture.service.move(fixture.input)).rejects.toThrow();
    expect(fs.existsSync(fixture.main)).toBe(true);
    expect(await fixture.service.pending(fixture.primary.projectId)).toEqual([]);
    if (state === "occupied") expect(fs.readFileSync(path.join(fixture.destination, "keep"), "utf8")).toBe("keep");
  });

  it("should cancel a positively failed rename only after proving the original checkout is intact", async () => {
    fixture = await primaryMoveFixture();
    vi.spyOn(fixture.files, "rename").mockResolvedValue({ ok: false, code: "unsupported", details: "cross-filesystem move refused" });
    await expect(fixture.service.move(fixture.input)).rejects.toThrow("cross-filesystem move refused");
    expect(await fixture.service.pending(fixture.primary.projectId)).toEqual([]);
    expect(fs.existsSync(fixture.main)).toBe(true);
  });

  it("should retain ambiguity if the old path is recreated or the destination is replaced", async () => {
    fixture = await primaryMoveFixture();
    const original = fixture.files.rename.bind(fixture.files);
    vi.spyOn(fixture.files, "rename").mockImplementation(async move => {
      const result = await original(move); fs.mkdirSync(fixture.main); return result;
    });
    await expect(fixture.service.move(fixture.input)).rejects.toThrow("previous project path");
    const move = (await fixture.service.pending(fixture.primary.projectId))[0]!;
    await expect(fixture.service.reconcile(move.id)).rejects.toThrow("uncertain");
    expect(fs.existsSync(fixture.main)).toBe(true);
    expect(fs.existsSync(fixture.destination)).toBe(true);
  });
});
