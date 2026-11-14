import type {
  OpenCodexGitSyncInspection, OpenCodexGitSyncPlan, OpenCodexGitSyncRequest,
  OpenCodexGitSyncResult
} from "@open-codex-ui/opencodex-protocol";
import { createGitErrorMessage } from "./gitCommandRunner.js";
import { planSynchronization, sameSyncPlan } from "./gitSyncPlanning.js";
import { GitSyncFailure, GitSyncRepository, type GitSyncPorts } from "./gitSyncRepository.js";
import { updateSyncTracking } from "./gitSyncTracking.js";

/** Guided, source-scoped synchronization without force pushes, resets or automatic stashes. */
export class GitSyncService {
  /** Worktree identities whose Git state is currently being inspected or mutated. */
  private readonly active = new Set<string>();

  /** Receives explicit I/O ports so tests can use isolated local repositories. */
  constructor(private readonly ports: GitSyncPorts) {}

  /** Returns translatable outcomes instead of exposing localized Git output as the main error. */
  async run(request: OpenCodexGitSyncRequest): Promise<OpenCodexGitSyncResult> {
    const repo = new GitSyncRepository(this.ports, request);
    let key: string | null = null;
    let acquired = false;
    try {
      if (request.sourceId === null) throw new GitSyncFailure("gitFailed", "A source is required for Git synchronization.");
      await this.ports.protectedBranches(request);
      key = `${request.sourceId}\0${await repo.directory()}`;
      if (this.active.has(key)) throw new GitSyncFailure("busy");
      this.active.add(key);
      acquired = true;
      switch (request.type) {
        case "git.sync.inspect":
          return result("inspected", await repo.inspect());
        case "git.sync.simple":
          return await this.simple(repo, request.direction);
        case "git.sync.configure":
          return await this.configure(repo, request);
        case "git.sync.plan":
          return result("planned", await repo.inspect(), await planSynchronization(repo, request.target, request.strategy));
        case "git.sync.execute":
          return await this.execute(repo, request.plan);
        case "git.sync.resolve":
          return await this.resolve(repo, request);
        case "git.sync.continue":
        case "git.sync.abort":
          return await this.recover(repo, request);
      }
      throw new GitSyncFailure("invalidTarget");
    } catch (error) {
      let inspection: OpenCodexGitSyncInspection | null = null;
      if (acquired) {
        try { inspection = await repo.inspect(); } catch { /* The original failure remains available below. */ }
      }
      let issue: OpenCodexGitSyncResult["issue"] = "gitFailed";
      if (error instanceof GitSyncFailure) issue = error.issue;
      let details: string | null = String(error);
      if (error instanceof GitSyncFailure) details = error.details;
      else if (error instanceof Error) details = error.message;
      let outcome: OpenCodexGitSyncResult["outcome"] = "blocked";
      if (issue === "gitFailed" || issue === "trackingSetupFailed") outcome = "error";
      return { outcome, inspection, plan: null, issue, details };
    } finally {
      if (acquired && key !== null) this.active.delete(key);
    }
  }

  /** Runs only an ordinary push or fast-forward update, escalating history integration to explicit review. */
  private async simple(repo: GitSyncRepository, direction: "push" | "pull"): Promise<OpenCodexGitSyncResult> {
    const inspection = await repo.inspect();
    const target = inspection.suggestedTarget;
    if (target === null) throw new GitSyncFailure("invalidTarget");
    const plan = await planSynchronization(repo, target, "merge", direction === "push");
    if (plan.action === "merge" || plan.action === "rebase"
      || (direction === "push" && plan.behindCount > 0)) throw new GitSyncFailure("advancedRequired");
    if (direction === "pull" && plan.behindCount === 0) return result("synchronized", await repo.inspect());
    return await this.execute(repo, plan, direction);
  }

  /** Persists one explicit favorite or branch override in the selected source's local Git configuration. */
  private async configure(
    repo: GitSyncRepository,
    request: Extract<OpenCodexGitSyncRequest, { type: "git.sync.configure" }>
  ): Promise<OpenCodexGitSyncResult> {
    const inspection = await repo.inspect();
    if (inspection.operation !== null) throw new GitSyncFailure("operationInProgress");
    const branch = inspection.status.branchName;
    if (branch !== request.branchName) throw new GitSyncFailure("reviewChanged");
    const isFavorite = request.favoriteRemote !== undefined;
    if (isFavorite === (request.branchRemote !== undefined)) throw new GitSyncFailure("invalidTarget");
    const remote = request.favoriteRemote ?? request.branchRemote ?? null;
    if (remote !== null && (remote.startsWith("-") || !inspection.status.remotes.some(item => item.name === remote))) {
      throw new GitSyncFailure("invalidTarget");
    }
    if (!isFavorite && branch === null) throw new GitSyncFailure("detachedHead");
    let key = `branch.${branch}.pushRemote`;
    if (isFavorite) key = "remote.pushDefault";
    if (remote === null) {
      const favorite = inspection.status.synchronization?.favoriteRemote;
      if (favorite != null && await repo.config("remote.pushDefault") === null) {
        await repo.git(["config", "--local", "--replace-all", "remote.pushDefault", favorite]);
      }
      const response = await repo.git(["config", "--local", "--unset-all", key], { allowFailure: true });
      if (response.exitCode !== 0 && response.exitCode !== 5) throw new GitSyncFailure("gitFailed", createGitErrorMessage(response));
    } else {
      await repo.git(["config", "--local", "--replace-all", key, remote]);
    }
    return result("inspected", await repo.inspect());
  }

  /** Stages only a literal path belonging to the operation the user just reviewed. */
  private async resolve(
    repo: GitSyncRepository,
    request: Extract<OpenCodexGitSyncRequest, { type: "git.sync.resolve" }>
  ): Promise<OpenCodexGitSyncResult> {
    const inspection = await repo.inspect();
    const operation = inspection.operation;
    if (operation === null || operation.fingerprint !== request.operation.fingerprint
      || operation.kind !== request.operation.kind || !operation.conflicts.includes(request.path)) {
      throw new GitSyncFailure("reviewChanged");
    }
    if (operation.kind === "other") throw new GitSyncFailure("unsupportedOperation");
    await repo.git(["--literal-pathspecs", "add", "--", request.path]);
    return result("inspected", await repo.inspect());
  }

  /** Revalidates the review, integrates commits, then pushes one explicit commit/ref pair. */
  private async execute(repo: GitSyncRepository, reviewed: OpenCodexGitSyncPlan, direction?: "push" | "pull"): Promise<OpenCodexGitSyncResult> {
    const allowDirty = direction === "push";
    const plan = await planSynchronization(repo, reviewed.target, reviewed.strategy, allowDirty);
    if (allowDirty && plan.behindCount > 0) throw new GitSyncFailure("advancedRequired");
    if (!sameSyncPlan(reviewed, plan)) throw new GitSyncFailure("reviewChanged");
    await repo.requireReady(plan.branchName, plan.localHead, allowDirty);
    if (plan.remoteHead !== null && plan.behindCount > 0) {
      let args = ["merge", "--ff-only", plan.remoteHead];
      if (plan.action === "merge") args = ["merge", "--no-edit", "--no-ff", plan.remoteHead];
      if (plan.action === "rebase") args = ["rebase", "--rebase-merges", plan.remoteHead];
      const integration = await repo.git(editorFree(args), { allowFailure: true });
      const inspection = await repo.inspect();
      if (inspection.operation !== null) {
        return result("conflicts", inspection, null, "conflicts", createGitErrorMessage(integration));
      }
      if (integration.exitCode !== 0) throw new GitSyncFailure("gitFailed", createGitErrorMessage(integration));
    }
    await repo.requireReady(plan.branchName, undefined, allowDirty);
    const head = await repo.head();
    if (plan.behindCount === 0 && head !== plan.localHead) throw new GitSyncFailure("reviewChanged");
    if (plan.action === "fastForward" && head !== plan.remoteHead) throw new GitSyncFailure("reviewChanged");
    if (plan.action === "merge") {
      const parents = (await repo.text(["rev-list", "--parents", "-n", "1", head])).split(" ");
      if (parents.length !== 3 || parents[1] !== plan.localHead || parents[2] !== plan.remoteHead) {
        throw new GitSyncFailure("reviewChanged");
      }
    }
    if (plan.remoteHead !== null) {
      const ancestry = await repo.git(["merge-base", "--is-ancestor", plan.remoteHead, head], { allowFailure: true });
      if (ancestry.exitCode !== 0) throw new GitSyncFailure("reviewChanged");
    }
    const inspection = await repo.inspect();
    if (await repo.pushUrl(plan.target, inspection.status) !== plan.pushUrl) throw new GitSyncFailure("reviewChanged");
    if (await repo.remoteHead(plan.pushUrl, plan.target.branchName) !== plan.remoteHead) throw new GitSyncFailure("remoteChanged");
    await repo.requireReady(plan.branchName, head, allowDirty);
    if (direction !== "pull" && (head !== plan.remoteHead || plan.target.setUpstream)) {
      const args = ["push", "--porcelain", "--no-follow-tags", "--recurse-submodules=no"];
      args.push("--", plan.pushUrl, `${head}:refs/heads/${plan.target.branchName}`);
      const push = await repo.git(args, { allowFailure: true });
      if (push.exitCode !== 0) {
        if (await repo.remoteHead(plan.pushUrl, plan.target.branchName) !== plan.remoteHead) {
          throw new GitSyncFailure("remoteChanged", createGitErrorMessage(push));
        }
        throw new GitSyncFailure("gitFailed", createGitErrorMessage(push));
      }
    }
    await updateSyncTracking(repo, plan, head);
    return result("synchronized", await repo.inspect());
  }

  /** Continues/aborts only the durable operation reviewed by this source/worktree dialog. */
  private async recover(
    repo: GitSyncRepository,
    request: Extract<OpenCodexGitSyncRequest, { type: "git.sync.continue" | "git.sync.abort" }>
  ): Promise<OpenCodexGitSyncResult> {
    const inspection = await repo.inspect();
    const operation = inspection.operation;
    if (operation === null || operation.fingerprint !== request.operation.fingerprint
      || operation.kind !== request.operation.kind) throw new GitSyncFailure("reviewChanged");
    if (operation.kind === "other") throw new GitSyncFailure("unsupportedOperation");
    const aborting = request.type === "git.sync.abort";
    if (!aborting && operation.conflicts.length > 0) return result("conflicts", inspection, null, "conflicts");
    if (!aborting && operation.branchName !== null
      && (await repo.ports.protectedBranches(repo.scope)).includes(operation.branchName)) {
      throw new GitSyncFailure("protectedBranch");
    }
    const response = await repo.git(editorFree([operation.kind, aborting ? "--abort" : "--continue"]), { allowFailure: true });
    const next = await repo.inspect();
    if (next.operation !== null) {
      return result("conflicts", next, null, "conflicts", createGitErrorMessage(response));
    }
    if (response.exitCode !== 0) throw new GitSyncFailure("gitFailed", createGitErrorMessage(response));
    // Recovery never sends commits; the user reviews a freshly fetched plan afterwards.
    return result(aborting ? "aborted" : "continued", next);
  }
}

/** Suppresses interactive editors and user-configured automatic stash/reference rewrites. */
function editorFree(args: string[]): string[] {
  return ["-c", "core.editor=true", "-c", "sequence.editor=true", "-c", "rebase.autoStash=false",
    "-c", "rebase.updateRefs=false", "-c", "merge.autoStash=false", ...args];
}

/** Builds a plain result shared by inspection, execution, and conflict recovery. */
function result(
  outcome: OpenCodexGitSyncResult["outcome"], inspection: OpenCodexGitSyncInspection,
  plan: OpenCodexGitSyncPlan | null = null, issue: OpenCodexGitSyncResult["issue"] = null,
  details: string | null = null
): OpenCodexGitSyncResult {
  return { outcome, inspection, plan, issue, details };
}
