import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import { normalizeFileLinkGrants } from "@open-codex-ui/opencodex-protocol";
import type { OpenCodexFileRequest, OpenCodexFileResult, OpenCodexFileLinkAccess,
  OpenCodexSettings } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort, ProjectSourcePort } from "../runtime/runtimePorts.js";
import { requireToolWorkspace } from "../workspaces/workspaceToolContext.js";
import { runLocalFileOperation, runSourceFileOperation, type FileWorkerRequest } from "./runFileOperation.js";

/** Uses the normal serialized settings persistence for workspace-specific grants. */
interface FileAccessSettings {
  get(): OpenCodexSettings;
  update(patch: Partial<OpenCodexSettings>): Promise<OpenCodexSettings>;
}

/** Validates workspace identity and attaches backend-owned filesystem permissions. */
export class WorkspaceFilesService {
  /** Orders saves and permission changes so revocation waits for an ongoing write. */
  private mutations: Promise<unknown> = Promise.resolve();

  /** Captures source resolution, persisted workspace ownership and settings. */
  constructor(
    private readonly repository: OpenCodexCacheRepository | null,
    private readonly sources: Pick<ProjectSourcePort, "resolveRequestedSource">,
    private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly settings?: FileAccessSettings
  ) {}

  /** Keeps reads independent while serializing writes and authorization changes. */
  async execute(request: OpenCodexFileRequest): Promise<OpenCodexFileResult<unknown>> {
    if (request.type !== "workspaceFiles.save" && request.type !== "workspaceFiles.setLinkAccess") {
      return await this.perform(request);
    }
    const operation = this.mutations.then(() => this.perform(request));
    this.mutations = operation.catch(() => undefined);
    return await operation;
  }

  /** Validates identity before issuing an operation in the source filesystem. */
  private async perform(request: OpenCodexFileRequest): Promise<OpenCodexFileResult<unknown>> {
    const { target } = request;
    try {
      const workspace = await requireToolWorkspace(this.repository, target.workspaceId, target.projectId);
      if (workspace.sourceId !== target.sourceId || workspace.path !== target.workspacePath) {
        throw new Error("Workspace context changed. Reopen the file from its original workspace.");
      }
      const source = await this.sources.resolveRequestedSource(target.sourceId);
      const grants = normalizeFileLinkGrants(this.settings?.get().fileLinkGrants);
      const permissions = grants.filter(grant => grant.sourceId === target.sourceId &&
        grant.projectId === target.projectId && grant.workspaceId === target.workspaceId &&
        grant.workspacePath === target.workspacePath);
      /** Supplies grants from persisted settings, overwriting any injected transport field. */
      const run = async (operation: OpenCodexFileRequest): Promise<OpenCodexFileResult<unknown>> => {
        const payload: FileWorkerRequest = { ...operation, permissions };
        if (source.kind === "local") return await runLocalFileOperation(payload);
        return await runSourceFileOperation(await this.clients.ensureClient(target.sourceId), payload);
      };
      if (request.type !== "workspaceFiles.setLinkAccess") return await run(request);
      if (!this.settings) throw new Error("File permission persistence is unavailable.");
      if (!["denied", "readOnly", "readWrite"].includes(request.access)) {
        throw new Error("Invalid file access mode.");
      }
      const inspected = await run({ type: "workspaceFiles.linkAccess", target });
      if (!inspected.ok) return inspected;
      const link = inspected.value as OpenCodexFileLinkAccess;
      if (!link.external || link.destination !== request.destination) {
        return { ok: false, code: "conflict", details: "Link destination changed. Reopen access settings." };
      }
      const retained = grants.filter(grant => !permissions.includes(grant) || grant.destination !== link.destination);
      retained.push({ sourceId: target.sourceId, projectId: target.projectId, workspaceId: target.workspaceId,
        workspacePath: target.workspacePath, destination: link.destination, access: request.access });
      await this.settings.update({ fileLinkGrants: retained });
      return { ok: true, value: { ...link, access: request.access } };
    } catch (error) {
      return { ok: false, code: "unavailable", details: String(error) };
    }
  }
}
