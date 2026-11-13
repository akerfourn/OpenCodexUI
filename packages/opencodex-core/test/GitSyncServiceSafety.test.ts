import { afterEach, describe, expect, it } from "vitest";
import path from "node:path";
import { GitSyncService } from "../src/backend/git/GitSyncService";
import { createGitSyncFixture } from "./gitSyncFixture";

type Fixture = Awaited<ReturnType<typeof createGitSyncFixture>>;
const fixtures: Fixture[] = [];
/** Registers isolated repositories for cleanup even after failed assertions. */
async function fixture(): Promise<Fixture> {
  const value = await createGitSyncFixture();
  fixtures.push(value);
  return value;
}
afterEach(async () => { for (const fixture of fixtures.splice(0)) await fixture.dispose(); });

describe("Git synchronization destination and concurrency safeguards", () => {
  it("should synchronize against the push endpoint when its fetch URL points elsewhere", async () => {
    const test = await fixture();
    const originalRemote = await test.git(test.remote, ["rev-parse", "refs/heads/dev"]);
    const pushRemote = path.join(test.root, "push.git");
    await test.git(test.root, ["clone", "--bare", "--quiet", test.remote, pushRemote]);
    await test.git(test.local, ["remote", "set-url", "--push", "origin", pushRemote]);
    await test.git(test.peer, ["remote", "set-url", "origin", pushRemote]);
    await test.commit(test.local, "local.txt", "local\n", "local");
    const peer = await test.advanceRemote();
    const plan = await test.plan();
    expect(plan).toMatchObject({ pushUrl: pushRemote, remoteHead: peer, action: "rebase" });
    expect((await test.execute(plan)).outcome).toBe("synchronized");
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(originalRemote);
    expect(await test.git(pushRemote, ["rev-parse", "refs/heads/dev"])).toBe(await test.git(test.local, ["rev-parse", "HEAD"]));
  });

  it("should reject multi-destination pushes instead of broadcasting commits", async () => {
    const test = await fixture();
    await test.git(test.local, ["config", "--add", "remote.origin.pushurl", test.remote]);
    await test.git(test.local, ["config", "--add", "remote.origin.pushurl", path.join(test.root, "other.git")]);
    const result = await test.service.run({ ...test.scope, type: "git.sync.plan", target: test.target, strategy: "rebase" });
    expect(result.issue).toBe("unsupportedRemote");
    expect(test.commands.some((args) => args[0] === "push")).toBe(false);
  });

  it("should preserve custom tracking rules unless ordinary tracking can be configured explicitly", async () => {
    const test = await fixture();
    const mapping = "+refs/heads/*:refs/remotes/custom/*";
    await test.git(test.local, ["config", "remote.origin.fetch", mapping]);
    const blocked = await test.service.run({ ...test.scope, type: "git.sync.plan",
      target: { ...test.target, setUpstream: true }, strategy: "rebase" });
    expect(blocked.issue).toBe("unsupportedTracking");
    expect((await test.execute(await test.plan())).outcome).toBe("synchronized");
    expect(await test.git(test.local, ["config", "remote.origin.fetch"])).toBe(mapping);
  });

  it("should preserve merge topology and leave other local branches untouched during rebase", async () => {
    const test = await fixture();
    await test.git(test.local, ["switch", "-c", "feature"]);
    const feature = await test.commit(test.local, "feature.txt", "feature\n", "feature");
    await test.git(test.local, ["switch", "dev"]);
    await test.commit(test.local, "local.txt", "local\n", "local");
    await test.git(test.local, ["merge", "--no-edit", "--no-ff", "feature"]);
    await test.advanceRemote();
    expect((await test.execute(await test.plan())).outcome).toBe("synchronized");
    expect((await test.git(test.local, ["rev-list", "--parents", "-n", "1", "HEAD"])).split(" ")).toHaveLength(3);
    expect(await test.git(test.local, ["rev-parse", "feature"])).toBe(feature);
  });

  it("should reject a racing remote update without forcing the final push", async () => {
    const test = await fixture();
    await test.commit(test.local, "local.txt", "local\n", "local");
    await test.advanceRemote();
    const plan = await test.plan();
    let raced = "";
    const service = new GitSyncService({ ...test.ports, runGit: async (cwd, sourceId, args, options) => {
      if (args[0] === "push") raced = await test.advanceRemote("race.txt", "racing update\n");
      return await test.ports.runGit(cwd, sourceId, args, options);
    } });
    const result = await service.run({ ...test.scope, type: "git.sync.execute", plan });
    expect(result.issue).toBe("remoteChanged");
    expect(raced.length).toBeGreaterThan(0);
    expect(await test.git(test.remote, ["rev-parse", "refs/heads/dev"])).toBe(raced);
    expect(test.commands.find((args) => args[0] === "push")).not.toContain("--force");
    expect(await test.git(test.local, ["show", "HEAD:local.txt"])).toBe("local");
  });

  it("should reject local commits added after the reviewed snapshot", async () => {
    const test = await fixture();
    const plan = await test.plan();
    const head = await test.commit(test.local, "later.txt", "later\n", "added after review");
    expect((await test.execute(plan)).issue).toBe("reviewChanged");
    expect(await test.git(test.local, ["rev-parse", "HEAD"])).toBe(head);
    expect(test.commands.some((args) => args[0] === "push")).toBe(false);
    expect(await test.git(test.local, ["for-each-ref", "--format=%(refname)", "refs/opencodexui/sync/"])).toBe("");
  });

  it("should serialize requests for the same physical Git worktree", async () => {
    const test = await fixture();
    let release!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let pending = true;
    const service = new GitSyncService({ ...test.ports, runGit: async (cwd, sourceId, args, options) => {
      if (args[0] === "ls-remote" && pending) { pending = false; entered(); await gate; }
      return await test.ports.runGit(cwd, sourceId, args, options);
    } });
    const planning = service.run({ ...test.scope, type: "git.sync.plan", target: test.target, strategy: "rebase" });
    await started;
    try {
      expect((await service.run({ ...test.scope, type: "git.sync.inspect" })).issue).toBe("busy");
    } finally { release(); }
    expect((await planning).outcome).toBe("planned");
  });

  it("should discover conflicts only in their owning linked worktree", async () => {
    const test = await fixture();
    const linked = path.join(test.root, "linked");
    await test.git(test.local, ["worktree", "add", "--quiet", "-b", "linked", linked, "HEAD"]);
    test.allowedPaths.add(linked);
    const head = await test.commit(linked, "shared.txt", "linked\n", "linked conflict");
    await test.advanceRemote("shared.txt", "remote\n");
    const scope = { ...test.scope, projectPath: linked, workspaceId: "linked" };
    const plan = await test.service.run({ ...scope, type: "git.sync.plan", target: test.target, strategy: "rebase" });
    const paused = await test.service.run({ ...scope, type: "git.sync.execute", plan: plan.plan! });
    expect(paused.inspection?.operation?.kind).toBe("rebase");
    const main = await test.service.run({ ...test.scope, type: "git.sync.inspect" });
    expect(main.inspection?.operation).toBeNull();
    const aborted = await test.service.run({ ...scope, type: "git.sync.abort", operation: paused.inspection!.operation! });
    expect(aborted.outcome).toBe("aborted");
    expect(await test.git(linked, ["rev-parse", "HEAD"])).toBe(head);
  });
});
