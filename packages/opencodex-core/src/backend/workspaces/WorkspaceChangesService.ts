import { createHash } from "node:crypto";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexFileContext, OpenCodexWorkspaceChanges } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort, ProjectSourcePort } from "../runtime/runtimePorts.js";
import { createRunGit, type RunGit } from "../git/gitCommandRunner.js";
import { runLocalFileOperation, runSourceFileOperation } from "../files/runFileOperation.js";
import { requireToolWorkspace } from "./workspaceToolContext.js";
import { workspaceSourcePathsEqual } from "./workspaceSourcePath.js";

interface ChangesRunners {
  local: typeof runLocalFileOperation;
  source: typeof runSourceFileOperation;
}

/** On-demand observations use source Git and metadata, never host-side guesses or background watchers. */
export class WorkspaceChangesService {
  /** Serializes baseline comparisons and bounds concurrent work on one source. */
  private readonly running = new Map<string, Set<string>>();

  /** Injects execution and time boundaries for portable, deterministic checks. */
  constructor(private readonly repository: OpenCodexCacheRepository,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly sources: Pick<ProjectSourcePort, "resolveRequestedSource">,
    private readonly git: RunGit = createRunGit(clients),
    private readonly runners: ChangesRunners = { local: runLocalFileOperation, source: runSourceFileOperation },
    private readonly now: () => string = () => new Date().toISOString()) {}

  /** Persists only a complete, still-matching observation; failures leave the previous baseline intact. */
  async read(input: OpenCodexFileContext): Promise<OpenCodexWorkspaceChanges> {
    const context = { projectId: input.projectId, workspaceId: input.workspaceId,
      sourceId: input.sourceId, workspacePath: input.workspacePath };
    await this.requireContext(context);
    const source = await this.sources.resolveRequestedSource(context.sourceId);
    if (source.id !== context.sourceId) throw new Error("Requested source does not own this change observation.");
    const running = this.running.get(context.sourceId) ?? new Set<string>();
    if (running.has(context.workspaceId) || running.size >= 3) throw new Error("Workspace change checks are already running. Retry when they finish.");
    running.add(context.workspaceId);
    this.running.set(context.sourceId, running);
    try {
      await this.requireGitRoot(context);
      const status = await this.status(context);
      const listing = await this.runGit(context, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
      const paths = listing.length === 0 ? [] : listing.slice(0, -1).split("\0");
      const request = { type: "workspaceChanges" as const, target: { ...context, path: "" }, paths };
      let result;
      if (source.kind === "local") result = await this.runners.local(request);
      else result = await this.runners.source(await this.clients.ensureClient(context.sourceId), request);
      if (!result.ok) throw new Error(result.details ?? "Workspace change check failed.");
      const value = result.value as { fingerprint?: unknown; complete?: unknown } | null;
      if (value === null || typeof value !== "object" || typeof value.fingerprint !== "string"
        || !/^[a-f0-9]{64}$/u.test(value.fingerprint) || typeof value.complete !== "boolean") {
        throw new Error("Invalid workspace change observation.");
      }
      const stable = status === await this.status(context);
      await this.requireContext(context);
      const hasChanges = status.split("\0").some(line => line.length > 0 && !line.startsWith("# "));
      const checkedAt = this.now();
      if (!value.complete || !stable) {
        const previous = await this.repository.workspaces.changes.get(context.workspaceId);
        return { ...context, checkedAt, hasChanges, lastChangedAt: previous?.lastChangedAt ?? null, state: "partial" };
      }
      const fingerprint = createHash("sha256").update(status).update(value.fingerprint).digest("hex");
      return await this.repository.workspaces.changes.observe({ ...context, fingerprint, checkedAt, hasChanges });
    } finally {
      running.delete(context.workspaceId);
      if (running.size === 0) this.running.delete(context.sourceId);
    }
  }

  /** Refuses ancestor repositories: the inventory must belong to the exact registered checkout. */
  private async requireGitRoot(context: OpenCodexFileContext): Promise<void> {
    const result = await this.git(context.workspacePath, context.sourceId,
      ["--no-optional-locks", "-c", "core.fsmonitor=false", "rev-parse", "--show-toplevel"],
      { timeoutMs: 10000, outputBytesCap: 16384 });
    if (result.exitCode !== 0 || result.stdoutCapReached || result.stderrCapReached
      || !result.stdout.endsWith("\n") || !workspaceSourcePathsEqual(result.stdout.slice(0, -1), context.workspacePath)) {
      throw new Error("Change checks require the exact root of a Git checkout.");
    }
  }

  /** Ignores remote-tracking counters: fetching does not imply work in the checkout. */
  private async status(context: OpenCodexFileContext): Promise<string> {
    const output = await this.runGit(context, ["status", "--porcelain=v2", "--branch", "-z", "--untracked-files=all", "--no-ahead-behind"]);
    return output.split("\0").filter(line => !line.startsWith("# branch.upstream ") && !line.startsWith("# branch.ab ")).join("\0");
  }

  /** Disables optional index writes and fsmonitor hooks, and refuses truncated inventories. */
  private async runGit(context: OpenCodexFileContext, args: string[]): Promise<string> {
    const result = await this.git(context.workspacePath, context.sourceId,
      ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], { timeoutMs: 10000, outputBytesCap: 2 * 1024 * 1024 });
    if (result.exitCode !== 0 || result.stdoutCapReached || result.stderrCapReached
      || (result.stdout.length > 0 && !result.stdout.endsWith("\0"))) throw new Error("Git change inventory is incomplete or unavailable.");
    return result.stdout;
  }

  /** Source/path ownership and lifecycle checks are repeated after asynchronous filesystem reads. */
  private async requireContext(context: OpenCodexFileContext): Promise<void> {
    const workspace = await requireToolWorkspace(this.repository, context.workspaceId, context.projectId);
    if (workspace.projectId !== context.projectId || workspace.sourceId !== context.sourceId || workspace.path !== context.workspacePath) {
      throw new Error("Workspace context changed. Refresh before checking changes.");
    }
  }
}
