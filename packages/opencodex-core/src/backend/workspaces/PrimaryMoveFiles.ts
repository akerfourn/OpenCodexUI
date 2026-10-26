import type { OpenCodexDirectoryIdentity, OpenCodexFileContext, OpenCodexFileResult, OpenCodexWorkspaceMove } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort, ProjectSourcePort } from "../runtime/runtimePorts.js";
import { runLocalFileOperation, runSourceFileOperation, type FileWorkerRequest } from "../files/runFileOperation.js";

/** Executes bounded directory operations in the explicit source, never interpreting remote paths locally. */
export class PrimaryMoveFiles {
  /** Local sources use Electron's Node worker; remote sources require their own Node executable. */
  constructor(private readonly clients: Pick<ClientPort, "ensureClient">,
    private readonly sources: Pick<ProjectSourcePort, "resolveRequestedSource">,
    private readonly local = runLocalFileOperation, private readonly remote = runSourceFileOperation) {}

  /** Reads literal directories and stable identities before any journal or filesystem mutation. */
  async inspect(context: OpenCodexFileContext, location = context.workspacePath): Promise<OpenCodexDirectoryIdentity> {
    const result = await this.run(context.sourceId, { type: "primaryDirectory", operation: "inspect",
      target: { ...context, workspacePath: location, path: "" } });
    if (!result.ok) throw new Error(result.details ?? "Directory inspection failed.");
    const value = result.value as Partial<OpenCodexDirectoryIdentity> | null;
    if (value === null || typeof value !== "object" || typeof value.identity !== "string"
      || !/^-?\d+:\d+:-?\d+$/u.test(value.identity) || typeof value.looksBare !== "boolean"
      || !["missing", "file", "directory"].includes(value.markerKind ?? "")
      || (value.markerHash !== null && (typeof value.markerHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.markerHash)))) {
      throw new Error("Source did not return a complete directory identity.");
    }
    return value as OpenCodexDirectoryIdentity;
  }

  /** Returns positive helper failure separately from transport loss; callers journal both before dispatch. */
  async rename(move: OpenCodexWorkspaceMove): Promise<OpenCodexFileResult<unknown>> {
    return await this.run(move.sourceId, { type: "primaryDirectory", operation: "rename",
      target: { projectId: move.projectId, workspaceId: move.workspaceId, sourceId: move.sourceId,
        workspacePath: move.workspacePath, path: "" }, destinationPath: move.destinationPath,
      identity: move.primarySnapshot!.identity });
  }

  /** Resolves source kind explicitly; custom local-access commands still execute in their own environment. */
  private async run(sourceId: string, request: FileWorkerRequest): Promise<OpenCodexFileResult<unknown>> {
    const source = await this.sources.resolveRequestedSource(sourceId);
    if (source.id !== sourceId) throw new Error("Directory move source changed.");
    if (source.kind === "local") return await this.local(request);
    return await this.remote(await this.clients.ensureClient(sourceId), request);
  }
}
