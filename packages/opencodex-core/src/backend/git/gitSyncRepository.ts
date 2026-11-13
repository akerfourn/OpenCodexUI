import { createHash } from "node:crypto";
import type {
  OpenCodexGitStatus, OpenCodexGitSyncInspection, OpenCodexGitSyncIssue,
  OpenCodexGitSyncOperation, OpenCodexGitSyncScope, OpenCodexGitSyncTarget
} from "@open-codex-ui/opencodex-protocol";
import { createGitErrorMessage, type GitProcessResult, type RunGit, type RunGitOptions } from "./gitCommandRunner.js";

/** Minimal source-owned I/O used by the synchronization state machine. */
export interface GitSyncPorts {
  runGit: RunGit;
  readStatus(path: string, sourceId: string | null): Promise<OpenCodexGitStatus>;
  readDirectory(path: string, sourceId: string | null): Promise<string[]>;
  readFile(path: string, sourceId: string | null): Promise<string>;
  protectedBranches(scope: OpenCodexGitSyncScope): Promise<string[]>;
}

/** Stable user-facing failure, with optional technical output kept separately. */
export class GitSyncFailure extends Error {
  /** Records a translatable reason without discarding Git's diagnostic output. */
  constructor(readonly issue: OpenCodexGitSyncIssue, readonly details: string | null = null) {
    super(details ?? issue);
  }
}

/** Validates commit identities before they can become revision arguments. */
export function requireCommit(value: string): string {
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u.test(value)) throw new GitSyncFailure("reviewChanged");
  return value;
}

/** Reads one explicitly scoped worktree without host-side filesystem assumptions. */
export class GitSyncRepository {
  /** Binds a request to its source/worktree rather than any globally active project. */
  constructor(readonly ports: GitSyncPorts, readonly scope: OpenCodexGitSyncScope) {}

  /** Executes Git with bounded output and the owning source's process API. */
  async git(args: string[], options: RunGitOptions = {}): Promise<GitProcessResult> {
    const result = await this.ports.runGit(this.scope.projectPath, this.scope.sourceId, args, {
      timeoutMs: 120_000, ...options
    });
    if (result.stdoutCapReached || result.stderrCapReached) {
      throw new GitSyncFailure("gitFailed", "Git output was truncated; synchronization stopped before using incomplete data.");
    }
    return result;
  }

  /** Reads one scalar Git value, rejecting ordinary command failures. */
  async text(args: string[]): Promise<string> { return (await this.git(args)).stdout.trim(); }

  /** Reads an optional configuration value; only Git's missing-key exit is ignored. */
  async config(key: string, asBoolean = false): Promise<string | null> {
    const args = ["config"];
    if (asBoolean) args.push("--type=bool");
    const result = await this.git([...args, "--get", key], { allowFailure: true });
    if (result.exitCode === 1) return null;
    if (result.exitCode !== 0) throw new GitSyncFailure("gitFailed", createGitErrorMessage(result));
    return result.stdout.trim();
  }

  /** Reads the current commit, including a clear failure for an unborn branch. */
  async head(): Promise<string> {
    const result = await this.git(["rev-parse", "--verify", "HEAD"], { allowFailure: true });
    if (result.exitCode !== 0) throw new GitSyncFailure("noCommits");
    return requireCommit(result.stdout.trim());
  }

  /** Resolves the worktree-specific Git directory, also used as a serialization identity. */
  async directory(): Promise<string> {
    const result = await this.git(["rev-parse", "--absolute-git-dir"], { allowFailure: true });
    if (result.exitCode !== 0) throw new GitSyncFailure("notRepository", createGitErrorMessage(result));
    return result.stdout.replace(/\r?\n$/u, "");
  }

  /** Resolves Git metadata paths in the source filesystem, including linked worktrees. */
  async file(name: string): Promise<string> {
    const path = (await this.git(["rev-parse", "--path-format=absolute", "--git-path", name])).stdout.replace(/\r?\n$/u, "");
    return await this.ports.readFile(path, this.scope.sourceId);
  }

  /** Recovers ongoing Git operations from their durable worktree metadata. */
  async inspect(): Promise<OpenCodexGitSyncInspection> {
    const status = await this.ports.readStatus(this.scope.projectPath, this.scope.sourceId);
    if (!status.isRepository) throw new GitSyncFailure("notRepository");
    const entries = await this.ports.readDirectory(await this.directory(), this.scope.sourceId);
    const operation = await this.operation(entries, status);
    const suggestedTarget = await this.suggestTarget(status, operation?.branchName ?? null);
    return { status, operation, suggestedTarget };
  }

  /** Verifies branch identity, commit identity, cleanliness and absence of other operations. */
  async requireReady(branchName?: string, head?: string): Promise<OpenCodexGitSyncInspection> {
    const inspection = await this.inspect();
    if (inspection.operation !== null) throw new GitSyncFailure("operationInProgress");
    if (inspection.status.branchName === null) throw new GitSyncFailure("detachedHead");
    if (branchName !== undefined && inspection.status.branchName !== branchName) throw new GitSyncFailure("reviewChanged");
    if (head !== undefined && await this.head() !== head) throw new GitSyncFailure("reviewChanged");
    const trackedChanges = inspection.status.changedFiles.some((file) => file.status !== "untracked");
    if (trackedChanges || inspection.status.stagedFiles.length > 0) throw new GitSyncFailure("dirtyWorktree");
    return inspection;
  }

  /** Resolves and validates a single push endpoint instead of guessing from fetch URLs. */
  async pushUrl(target: OpenCodexGitSyncTarget, status: OpenCodexGitStatus): Promise<string> {
    if (!status.remotes.some((remote) => remote.name === target.remoteName)
      || target.remoteName.startsWith("-") || target.branchName.startsWith("-")) {
      throw new GitSyncFailure("invalidTarget");
    }
    const valid = await this.git(["check-ref-format", "--branch", target.branchName], { allowFailure: true });
    if (valid.exitCode !== 0 || target.branchName !== target.branchName.trim()) throw new GitSyncFailure("invalidTarget");
    const urls = (await this.git(["remote", "get-url", "--push", "--all", "--", target.remoteName])).stdout
      .split("\n").filter((url) => url.length > 0);
    if (urls.length !== 1 || await this.config(`remote.${target.remoteName}.mirror`, true) === "true") {
      throw new GitSyncFailure("unsupportedRemote");
    }
    return urls[0]!;
  }

  /** Reads the destination ref without interpreting localized Git error messages. */
  async remoteHead(url: string, branch: string): Promise<string | null> {
    const result = await this.git(["ls-remote", "--exit-code", "--heads", "--", url, `refs/heads/${branch}`], { allowFailure: true });
    if (result.exitCode === 2) return null;
    if (result.exitCode !== 0) throw new GitSyncFailure("gitFailed", createGitErrorMessage(result));
    const columns = result.stdout.trim().split(/\s+/u);
    if (columns[1] !== `refs/heads/${branch}`) throw new GitSyncFailure("remoteChanged");
    return requireCommit(columns[0] ?? "");
  }

  /** Suggests a destination, with every final choice still explicit in the review. */
  private async suggestTarget(status: OpenCodexGitStatus, operationBranch: string | null): Promise<OpenCodexGitSyncTarget | null> {
    const branch = status.branchName ?? operationBranch;
    if (branch === null || status.remotes.length === 0) return null;
    const upstream = (await this.text(["for-each-ref", "--format=%(upstream:remotename)%00%(upstream:remoteref)", `refs/heads/${branch}`])).split("\0");
    const pushRemote = await this.config(`branch.${branch}.pushRemote`) ?? await this.config("remote.pushDefault");
    let remoteName = pushRemote ?? upstream[0] ?? "";
    if (!status.remotes.some((remote) => remote.name === remoteName)) {
      remoteName = status.remotes.find((remote) => remote.name === "origin")?.name ?? status.remotes[0]!.name;
    }
    let branchName = branch;
    if (remoteName === upstream[0] && upstream[1]?.startsWith("refs/heads/")) branchName = upstream[1].slice(11).trim();
    return { remoteName, branchName, setUpstream: (upstream[0] ?? "").length === 0 };
  }

  /** Identifies only supported rebase/merge metadata; other sequencers remain blocked. */
  private async operation(entries: string[], status: OpenCodexGitStatus): Promise<OpenCodexGitSyncOperation | null> {
    let kind: OpenCodexGitSyncOperation["kind"] | null = null;
    let branchName = status.branchName;
    const identity: string[] = [];
    const rebase = entries.find((entry) => entry === "rebase-merge" || entry === "rebase-apply");
    if (rebase !== undefined) {
      const path = await this.text(["rev-parse", "--path-format=absolute", "--git-path", rebase]);
      const files = await this.ports.readDirectory(path, this.scope.sourceId);
      if (files.includes("head-name") && files.includes("orig-head") && files.includes("onto")) {
        kind = "rebase";
        const headName = (await this.file(`${rebase}/head-name`)).trim();
        branchName = headName.startsWith("refs/heads/") ? headName.slice(11) : null;
        identity.push(headName, (await this.file(`${rebase}/orig-head`)).trim(), (await this.file(`${rebase}/onto`)).trim());
      } else kind = "other";
    } else if (entries.includes("MERGE_HEAD")) {
      kind = "merge";
      identity.push((await this.file("MERGE_HEAD")).trim(), await this.head());
    } else if (entries.some((entry) => ["CHERRY_PICK_HEAD", "REVERT_HEAD", "sequencer", "BISECT_LOG"].includes(entry))) {
      kind = "other";
    }
    if (kind === null) return null;
    const conflicts = [...new Set([...status.changedFiles, ...status.stagedFiles]
      .filter((file) => file.status === "conflicted").map((file) => file.path))];
    const fingerprint = createHash("sha256").update(JSON.stringify([await this.directory(), kind, branchName, ...identity])).digest("hex");
    return { kind, branchName, fingerprint, conflicts };
  }
}
