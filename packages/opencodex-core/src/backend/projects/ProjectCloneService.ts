import path from "node:path";
import type { CachedSource } from "@open-codex-ui/opencodex-cache";
import { createGitErrorMessage, runHostProcess } from "../git/gitCommandRunner.js";
import { ProjectPathService, type ProjectPathServiceOptions } from "./ProjectPathService.js";

/** Clones repositories through the chosen source's process API. */
export class ProjectCloneService {
  /** Validates the parent directory in the source's filesystem. */
  private readonly paths: ProjectPathService;

  /** Receives the same source and path ports as ordinary project opening. */
  constructor(private readonly options: ProjectPathServiceOptions) {
    this.paths = new ProjectPathService(options);
  }

  /** Clones into a missing or empty directory; existing files remain protected by Git. */
  async clone(repositoryUrl: string, destinationPath: string, source: CachedSource): Promise<string> {
    const repository = repositoryUrl.trim();
    if (repository.length === 0 || repository.startsWith("-") || /[\r\n\0]/u.test(repository)) {
      throw new Error("A Git repository address is required.");
    }
    const destination = destinationPath.trim();
    const syntax = destination.startsWith("/") ? path.posix : path.win32;
    const isAbsolute = destination.startsWith("/") || /^[a-z]:[\\/]/iu.test(destination) || destination.startsWith("\\\\");
    if (!isAbsolute || !syntax.isAbsolute(destination) || /[\r\n\0]/u.test(destination)) {
      throw new Error("Choose an absolute destination path in the selected source.");
    }
    const normalized = syntax.normalize(destination);
    const parent = syntax.dirname(normalized);
    if (parent === normalized || syntax.basename(normalized).length === 0) {
      throw new Error("Choose a project folder below an existing parent directory.");
    }
    const cwd = await this.paths.ensure(parent, false, source);
    const client = await this.options.clients.ensureClient(source.id);
    const response = await runHostProcess(client, {
      command: ["git", "-c", "credential.interactive=false", "clone", "--", repository, normalized],
      cwd,
      env: { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
      timeoutMs: 300_000,
      outputBytesCap: 2_000_000
    });
    if (response.exitCode !== 0) throw new Error(createGitErrorMessage(response));
    return normalized;
  }
}
