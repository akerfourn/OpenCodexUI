import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GitSyncService } from "../src/backend/git/GitSyncService";
import { createGitSyncFixture } from "./gitSyncFixture";

type Fixture = Awaited<ReturnType<typeof createGitSyncFixture>>;
const fixtures: Fixture[] = [];
/** Owns fixture cleanup even when an assertion fails. */
async function fixture(): Promise<Fixture> {
  const value = await createGitSyncFixture();
  fixtures.push(value);
  return value;
}
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.dispose(); });

// Native Git processes need headroom when the Windows suite runs in parallel.
describe("guided Git synchronization", { timeout: 20_000 }, () => {
  it("should push only local commits to the reviewed destination without forcing", async () => {
    const test = await fixture();
    const local = await test.commit(test.local, "local.txt", "local\n", "local");
    const plan = await test.plan();
    expect(plan.action).toBe("push");
    expect((await test.execute(plan)).outcome).toBe("synchronized");
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(local);
    const push = test.commands.find((args) => args[0] === "push")!;
    expect(push).toContain(`${local}:refs/heads/dev`);
    expect(push).not.toContain("--force");
  });

  it("should fast-forward when only remote commits exist", async () => {
    const test = await fixture();
    const remote = await test.advanceRemote();
    const plan = await test.plan();
    expect(plan.action).toBe("fastForward");
    expect((await test.execute(plan)).outcome).toBe("synchronized");
    expect(await test.git(test.local, ["rev-parse", "HEAD"])).toBe(remote);
    expect(test.commands.some((args) => args[0] === "push")).toBe(false);
  });

  it("should reapply unpublished commits after remote commits and push the combined history", async () => {
    const test = await fixture();
    const original = await test.commit(test.local, "local.txt", "local\n", "local");
    const remote = await test.advanceRemote();
    const plan = await test.plan();
    expect(plan).toMatchObject({ action: "rebase", aheadCount: 1, behindCount: 1 });
    expect((await test.execute(plan)).outcome).toBe("synchronized");
    const head = await test.git(test.local, ["rev-parse", "HEAD"]);
    expect(head).not.toBe(original);
    expect(await test.git(test.local, ["rev-parse", "HEAD^"])).toBe(remote);
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(head);
    expect(await test.git(test.local, ["status", "--porcelain"])).toBe("");
  });

  it("should preserve local commit identities when the project chooses merge", async () => {
    const test = await fixture();
    const local = await test.commit(test.local, "local.txt", "local\n", "local");
    const remote = await test.advanceRemote();
    const plan = await test.plan("merge");
    expect((await test.execute(plan)).outcome).toBe("synchronized");
    expect(await test.git(test.local, ["rev-parse", "HEAD^1"])).toBe(local);
    expect(await test.git(test.local, ["rev-parse", "HEAD^2"])).toBe(remote);
  });

  it("should preserve untracked drafts and reject tracked edits before any integration", async () => {
    const test = await fixture();
    await writeFile(path.join(test.local, "notes.txt"), "keep this draft");
    const plan = await test.plan();
    expect((await test.execute(plan)).outcome).toBe("synchronized");
    expect(await readFile(path.join(test.local, "notes.txt"), "utf8")).toBe("keep this draft");
    await writeFile(path.join(test.local, "shared.txt"), "uncommitted");
    const blocked = await test.service.run({ ...test.scope, type: "git.sync.plan", target: test.target, strategy: "rebase" });
    expect(blocked.issue).toBe("dirtyWorktree");
    expect(await readFile(path.join(test.local, "shared.txt"), "utf8")).toBe("uncommitted");
  });

  it("should require a new review if the remote advances after analysis", async () => {
    const test = await fixture();
    const local = await test.commit(test.local, "local.txt", "local\n", "local");
    const plan = await test.plan();
    const remote = await test.advanceRemote();
    expect((await test.execute(plan)).issue).toBe("reviewChanged");
    expect(await test.git(test.local, ["rev-parse", "HEAD"])).toBe(local);
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(remote);
  });

  it.each(["generated.txt", " generated.txt"])("should preserve ignored files that Git could replace: %s", async (file) => {
    const test = await fixture();
    await test.commit(test.local, ".gitignore", "*generated.txt\n", "ignore generated data");
    await writeFile(path.join(test.local, file), "irreplaceable local data");
    await test.advanceRemote(file, "remote tracked content\n");
    const response = await test.service.run({ ...test.scope, type: "git.sync.plan", target: test.target, strategy: "rebase" });
    expect(response.issue).toBe("untrackedCollision");
    expect(response.details).toContain(file);
    expect(await readFile(path.join(test.local, file), "utf8")).toBe("irreplaceable local data");
  });

  it("should pause a rebase conflict and recover it after recreating the service without pushing", async () => {
    const test = await fixture();
    await test.commit(test.local, "shared.txt", "local\n", "local conflict");
    const remote = await test.advanceRemote("shared.txt", "remote\n");
    const paused = await test.execute(await test.plan());
    expect(paused.outcome).toBe("conflicts");
    expect(paused.inspection?.operation).toMatchObject({ kind: "rebase", branchName: "dev", conflicts: ["shared.txt"] });
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(remote);
    const restarted = new GitSyncService(test.ports);
    const inspection = await restarted.run({ ...test.scope, type: "git.sync.inspect" });
    expect(inspection.inspection?.operation?.fingerprint).toBe(paused.inspection?.operation?.fingerprint);
    const unrelated = await restarted.run({ ...test.scope, type: "git.sync.resolve", operation: inspection.inspection!.operation!, path: "unrelated.txt" });
    expect(unrelated.issue).toBe("reviewChanged");
    await writeFile(path.join(test.local, "shared.txt"), "resolved\n");
    const resolved = await restarted.run({ ...test.scope, type: "git.sync.resolve", operation: inspection.inspection!.operation!, path: "shared.txt" });
    expect(resolved.inspection?.operation?.conflicts).toEqual([]);
    expect(test.commands).toContainEqual(["--literal-pathspecs", "add", "--", "shared.txt"]);
    const continued = await restarted.run({ ...test.scope, type: "git.sync.continue", operation: inspection.inspection!.operation! });
    expect(continued.outcome).toBe("continued");
    expect(continued.inspection?.operation).toBeNull();
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(remote);
    expect((await test.execute(await test.plan())).outcome).toBe("synchronized");
  }, 20_000);

  it.each(["rebase", "merge"] as const)("should abort a %s conflict back to the local commit", async (strategy) => {
    const test = await fixture();
    const local = await test.commit(test.local, "shared.txt", "local\n", "local conflict");
    const remote = await test.advanceRemote("shared.txt", "remote\n");
    const paused = await test.execute(await test.plan(strategy));
    const aborted = await test.service.run({ ...test.scope, type: "git.sync.abort", operation: paused.inspection!.operation! });
    expect(aborted.outcome).toBe("aborted");
    expect(await test.git(test.local, ["rev-parse", "HEAD"])).toBe(local);
    expect(await readFile(path.join(test.local, "shared.txt"), "utf8")).toBe("local\n");
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(remote);
  });

  it("should continue resolved merge conflicts without sending commits automatically", async () => {
    const test = await fixture();
    await test.commit(test.local, "shared.txt", "local\n", "local conflict");
    const remote = await test.advanceRemote("shared.txt", "remote\n");
    const paused = await test.execute(await test.plan("merge"));
    await writeFile(path.join(test.local, "shared.txt"), "resolved\n");
    await test.git(test.local, ["add", "shared.txt"]);
    const continued = await test.service.run({ ...test.scope, type: "git.sync.continue", operation: paused.inspection!.operation! });
    expect(continued.outcome).toBe("continued");
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(remote);
  });

  it("should reject recovery if a different operation is now present", async () => {
    const test = await fixture();
    await test.commit(test.local, "shared.txt", "local\n", "local conflict");
    await test.advanceRemote("shared.txt", "remote\n");
    const paused = await test.execute(await test.plan());
    const operation = { ...paused.inspection!.operation!, fingerprint: "stale" };
    const continued = await test.service.run({ ...test.scope, type: "git.sync.continue", operation });
    expect(continued.issue).toBe("reviewChanged");
    expect(continued.inspection?.operation?.conflicts).toEqual(["shared.txt"]);
  });

  it("should offer merge rather than rewrite commits already known on another remote", async () => {
    const test = await fixture();
    const local = await test.commit(test.local, "local.txt", "local\n", "published elsewhere");
    await test.git(test.local, ["update-ref", "refs/remotes/backup/shared", local]);
    await test.advanceRemote();
    const blocked = await test.service.run({ ...test.scope, type: "git.sync.plan", target: test.target, strategy: "rebase" });
    expect(blocked.issue).toBe("publishedCommits");
    expect((await test.plan("merge")).action).toBe("merge");
  });

  it("should not create integration commits on a protected branch", async () => {
    const test = await fixture();
    await test.commit(test.local, "local.txt", "local\n", "local");
    await test.advanceRemote();
    test.protectedBranches.push("dev");
    const blocked = await test.service.run({ ...test.scope, type: "git.sync.plan", target: test.target, strategy: "merge" });
    expect(blocked.issue).toBe("protectedBranch");
  });

  it("should publish a new destination branch and configure its tracking only when requested", async () => {
    const test = await fixture();
    const target = { ...test.target, branchName: "published", setUpstream: true };
    const response = await test.service.run({ ...test.scope, type: "git.sync.plan", target, strategy: "rebase" });
    expect(response.plan?.remoteHead).toBeNull();
    const pushed = await test.execute(response.plan!);
    expect(pushed.outcome).toBe("synchronized");
    expect(await test.git(test.local, ["config", "--get", "branch.dev.merge"])).toBe("refs/heads/published");
    expect(pushed.inspection?.status.upstreamName).toBe("origin/published");
  });

  it("should reject mirror remotes even when configured with Git's alternate boolean syntax", async () => {
    const test = await fixture();
    await test.git(test.local, ["config", "remote.origin.mirror", "yes"]);
    const blocked = await test.service.run({ ...test.scope, type: "git.sync.plan", target: test.target, strategy: "merge" });
    expect(blocked.issue).toBe("unsupportedRemote");
  });
});
