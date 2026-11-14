import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import { createGitSyncFixture } from "./gitSyncFixture";
import { resolveDefaultRemoteName } from "../src/backend/git/gitRemoteActions";
import { fetchUpdates } from "../src/backend/git/gitBranchActions";

type Fixture = Awaited<ReturnType<typeof createGitSyncFixture>>;
const fixtures: Fixture[] = [];

/** Keeps all commands inside disposable offline repositories. */
async function fixture(): Promise<Fixture> {
  const test = await createGitSyncFixture();
  fixtures.push(test);
  return test;
}

afterEach(async () => { for (const test of fixtures.splice(0)) await test.dispose(); });

/** Creates an independent publication server with the same initial commit. */
async function addBackup(test: Fixture): Promise<string> {
  const backup = path.join(test.root, "backup.git");
  await test.git(test.root, ["clone", "--bare", "--quiet", test.remote, backup]);
  await test.git(test.local, ["remote", "add", "backup", backup]);
  await test.git(test.local, ["fetch", "--quiet", "backup"]);
  return backup;
}

// Native Git processes need headroom when the Windows suite runs in parallel.
describe("simple Git exchange and favorite destinations", { timeout: 20_000 }, () => {
  it("should send committed work while retaining staged and unstaged local edits", async () => {
    const test = await fixture();
    const committed = await test.commit(test.local, "saved.txt", "saved\n", "saved change");
    await writeFile(path.join(test.local, "shared.txt"), "unstaged draft\n");
    await writeFile(path.join(test.local, "saved.txt"), "staged draft\n");
    await test.git(test.local, ["add", "saved.txt"]);

    const result = await test.service.run({ ...test.scope, type: "git.sync.simple", direction: "push" });

    expect(result.outcome).toBe("synchronized");
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(committed);
    expect(await readFile(path.join(test.local, "shared.txt"), "utf8")).toBe("unstaged draft\n");
    expect(await test.git(test.local, ["show", ":saved.txt"])).toBe("staged draft");
  });

  it("should push to the favorite alone and keep tags on the same default remote", async () => {
    const test = await fixture();
    const backup = await addBackup(test);
    const original = await test.git(test.remote, ["rev-parse", "refs/heads/dev"]);
    const saved = await test.service.run({ ...test.scope, type: "git.sync.configure", branchName: "dev", favoriteRemote: "backup" });
    expect(saved.inspection?.status.synchronization).toMatchObject({ favoriteRemote: "backup", target: { remoteName: "backup" } });
    const head = await test.commit(test.local, "outgoing.txt", "local\n", "local change");

    const result = await test.service.run({ ...test.scope, type: "git.sync.simple", direction: "push" });

    expect(result.outcome).toBe("synchronized");
    expect(await test.git(backup, ["rev-parse", "refs/heads/dev"])).toBe(head);
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(original);
    expect(await resolveDefaultRemoteName({ runGit: test.ports.runGit, readStatus: test.ports.readStatus }, test.local, test.scope.sourceId)).toBe("backup");
    expect(await test.git(test.local, ["config", "--local", "--get", "remote.pushDefault"])).toBe("backup");
  });

  it("should honor a branch override and restore the favorite when it is removed", async () => {
    const test = await fixture();
    await addBackup(test);
    await test.service.run({ ...test.scope, type: "git.sync.configure", branchName: "dev", favoriteRemote: "backup" });
    const overridden = await test.service.run({ ...test.scope, type: "git.sync.configure", branchName: "dev", branchRemote: "origin" });
    expect(overridden.inspection?.suggestedTarget?.remoteName).toBe("origin");

    const restored = await test.service.run({ ...test.scope, type: "git.sync.configure", branchName: "dev", branchRemote: null });

    expect(restored.inspection?.suggestedTarget?.remoteName).toBe("backup");
    expect(restored.inspection?.status.synchronization?.branchRemote).toBeNull();
  });

  it("should count and receive changes from the favorite even when the upstream points elsewhere", async () => {
    const test = await fixture();
    const backup = await addBackup(test);
    await test.service.run({ ...test.scope, type: "git.sync.configure", branchName: "dev", favoriteRemote: "backup" });
    const head = await test.commit(test.peer, "received.txt", "received\n", "received change");
    await test.git(test.peer, ["push", "--quiet", backup, "dev"]);
    const status = await fetchUpdates(test.ports, test.local, test.scope.sourceId);
    expect(status).toMatchObject({ behindCount: 1, aheadCount: 0, upstreamName: "origin/dev" });
    expect(test.commands).toContainEqual(["fetch", "--", "backup"]);

    const result = await test.service.run({ ...test.scope, type: "git.sync.simple", direction: "pull" });

    expect(result.outcome).toBe("synchronized");
    expect(await test.git(test.local, ["rev-parse", "HEAD"])).toBe(head);
    expect(test.commands.some(args => args[0] === "push")).toBe(false);
  });

  it("should offer advanced synchronization without integrating or sending diverged histories", async () => {
    const test = await fixture();
    const local = await test.commit(test.local, "local.txt", "local\n", "local change");
    const remote = await test.advanceRemote();

    for (const direction of ["push", "pull"] as const) {
      const result = await test.service.run({ ...test.scope, type: "git.sync.simple", direction });
      expect(result.issue).toBe("advancedRequired");
    }

    expect(await test.git(test.local, ["rev-parse", "HEAD"])).toBe(local);
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(remote);
    expect(test.commands.some(args => ["push", "rebase", "merge"].includes(args[0]!))).toBe(false);
  });

  it("should reject stale branch choices and missing remotes without changing the favorite", async () => {
    const test = await fixture();
    const stale = await test.service.run({ ...test.scope, type: "git.sync.configure", branchName: "other", favoriteRemote: "origin" });
    const missing = await test.service.run({ ...test.scope, type: "git.sync.configure", branchName: "dev", favoriteRemote: "missing" });
    expect(stale.issue).toBe("reviewChanged");
    expect(missing.issue).toBe("invalidTarget");
    expect(test.commands.some(args => args.includes("--replace-all"))).toBe(false);
  });

  it("should preserve a legacy branch destination until the favorite is explicitly selected", async () => {
    const test = await fixture();
    await addBackup(test);
    await test.git(test.local, ["branch", "--set-upstream-to=backup/dev", "dev"]);
    const before = await test.ports.readStatus(test.local, test.scope.sourceId);
    expect(before.synchronization).toMatchObject({ favoriteRemote: "origin", branchRemote: "backup", target: { remoteName: "backup" } });

    const result = await test.service.run({ ...test.scope, type: "git.sync.configure", branchName: "dev", branchRemote: null });

    expect(result.inspection?.suggestedTarget?.remoteName).toBe("origin");
    expect(result.inspection?.status.synchronization?.branchRemote).toBeNull();
  });

  it("should refuse a removed favorite without silently sending to origin", async () => {
    const test = await fixture();
    await test.commit(test.local, "unsent.txt", "local\n", "local change");
    await test.git(test.local, ["config", "--local", "remote.pushDefault", "removed"]);

    const result = await test.service.run({ ...test.scope, type: "git.sync.simple", direction: "push" });

    expect(result.issue).toBe("invalidTarget");
    expect(result.inspection?.status.synchronization).toMatchObject({ favoriteRemote: "removed", target: null });
    expect(test.commands.some(args => args[0] === "push")).toBe(false);
  });
});
