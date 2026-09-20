import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexFileRequest, OpenCodexFileResult } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort, ProjectSourcePort } from "../runtime/runtimePorts.js";
import { requireToolWorkspace } from "../workspaces/workspaceToolContext.js";
import { runLocalFileOperation, runSourceFileOperation } from "./runFileOperation.js";

/** Validates immutable workspace identity before accessing the appropriate filesystem. */
export class WorkspaceFilesService {
  /** Serializes writes from this runtime to the same source path. */
  private readonly saving = new Set<string>();

  /** Captures source resolution and persisted workspace ownership. */
  constructor(
    private readonly repository: OpenCodexCacheRepository | null,
    private readonly sources: Pick<ProjectSourcePort, "resolveRequestedSource">,
    private readonly clients: Pick<ClientPort, "ensureClient">
  ) {}

  /** Performs one operation without consulting UI selection or a default source. */
  async execute(request: OpenCodexFileRequest): Promise<OpenCodexFileResult<unknown>> {
    const { target } = request;
    const key = JSON.stringify([target.sourceId, target.workspacePath, target.path]);
    let ownsSave = false;
    try {
      const workspace = await requireToolWorkspace(this.repository, target.workspaceId, target.projectId);
      if (workspace.sourceId !== target.sourceId || workspace.path !== target.workspacePath) {
        throw new Error("Workspace context changed. Reopen the file from its original workspace.");
      }
      const source = await this.sources.resolveRequestedSource(target.sourceId);
      if (request.type === "workspaceFiles.save") {
        if (this.saving.has(key)) {
          return { ok: false, code: "conflict", details: "Another save is in progress for this file." };
        }
        this.saving.add(key);
        ownsSave = true;
      }
      if (source.kind === "local") return await runLocalFileOperation(request);
      const client = await this.clients.ensureClient(target.sourceId);
      return await runSourceFileOperation(client, request);
    } catch (error) {
      return { ok: false, code: "unavailable", details: String(error) };
    } finally {
      if (ownsSave) this.saving.delete(key);
    }
  }
}
