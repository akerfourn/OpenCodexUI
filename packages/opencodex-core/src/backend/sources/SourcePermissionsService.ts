import type { CachedSource, OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import type { v2 } from "@open-codex-ui/codex-rpc";
import type { SourcePermissionsRequest, SourcePermissionsSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort, ProjectSourcePort } from "../runtime/runtimePorts.js";
import { describeSourcePermissions, sourcePermissionEdits, userConfigLayer } from "./sourcePermissionMapping.js";

/** Edits user defaults through the owning app-server, without reconfiguring existing chats. */
export class SourcePermissionsService {
  /** Serializes writes even when multiple source connections share a user configuration. */
  private mutations: Promise<unknown> = Promise.resolve();

  /** Reads source identity independently of the selected project or the host filesystem. */
  constructor(
    private readonly sources: Pick<ProjectSourcePort, "resolveRequestedSource">,
    private readonly clients: Pick<ClientPort, "ensureClient" | "getClient">,
    private readonly cache: Pick<OpenCodexCacheRepository, "listSources"> | null
  ) {}

  /** Keeps read requests independent while ordering all explicit mutations. */
  async execute(request: SourcePermissionsRequest): Promise<SourcePermissionsSnapshot> {
    if (request.type === "sourcePermissions.read") return await this.perform(request);
    const operation = this.mutations.then(() => this.perform(request));
    this.mutations = operation.catch(() => undefined);
    return await operation;
  }

  /** Validates identity and revisions, delegates atomic writes and confirms their observable result. */
  private async perform(request: SourcePermissionsRequest): Promise<SourcePermissionsSnapshot> {
    if (typeof request.sourceId !== "string" || request.sourceId.trim().length === 0) {
      throw new Error("An explicit Codex source is required.");
    }
    const source = await this.sources.resolveRequestedSource(request.sourceId);
    if (source.id !== request.sourceId) throw new Error("The requested Codex source is unavailable.");
    const client = await this.clients.ensureClient(source.id);
    const [config, rules] = await Promise.all([
      client.request<v2.ConfigReadResponse>("config/read", { includeLayers: true }),
      client.request<v2.ConfigRequirementsReadResponse>("configRequirements/read", {})
    ]);
    let snapshot = describeSourcePermissions(source.id, config, rules.requirements, source.settings);
    if (request.type === "sourcePermissions.change") {
      if (request.revision !== snapshot.revision) {
        throw new Error("Source permissions changed. Refresh before applying your selections.");
      }
      const edits = sourcePermissionEdits(snapshot, request.patch);
      const written = await client.request<v2.ConfigWriteResponse>("config/batchWrite", {
        edits, expectedVersion: userConfigLayer(config).version, reloadUserConfig: false
      } satisfies v2.ConfigBatchWriteParams);
      if (written.status !== "ok" || written.filePath !== snapshot.configPath) {
        throw new Error("Settings were written but are overridden or their configuration path changed. Refresh to inspect the defaults.");
      }
      const confirmed = await client.request<v2.ConfigReadResponse>("config/read", { includeLayers: true });
      const confirmedRules = await client.request<v2.ConfigRequirementsReadResponse>("configRequirements/read", {});
      snapshot = describeSourcePermissions(source.id, confirmed, confirmedRules.requirements, source.settings);
      for (const key of Object.keys(request.patch) as (keyof typeof request.patch)[]) {
        if (request.patch[key] !== undefined && snapshot[key] !== request.patch[key]) {
          throw new Error("Codex did not confirm the requested defaults. Refresh the configuration.");
        }
      }
    }
    snapshot.sharedSourceIds = await this.sharedSources(source, snapshot.configPath);
    return snapshot;
  }

  /** Detects shared files only for already connected sources in a verified filesystem space. */
  private async sharedSources(source: CachedSource, configPath: string): Promise<string[]> {
    const space = sourceFilesystemSpace(source);
    if (space === null || this.cache === null) return [];
    const candidates = (await this.cache.listSources()).filter(item => item.id !== source.id
      && sourceFilesystemSpace(item) === space && this.clients.getClient(item.id) !== undefined);
    const results = await Promise.allSettled(candidates.map(async candidate => {
      const client = this.clients.getClient(candidate.id);
      if (client === undefined) return null;
      const response = await client.request<v2.ConfigReadResponse>("config/read", { includeLayers: true });
      const layer = userConfigLayer(response);
      if (layer.name.type === "user" && layer.name.file === configPath) return candidate.id;
      return null;
    }));
    // Unavailable peers do not invalidate a confirmed edit. The UI also explains that sharing may exist.
    return results.flatMap(result => result.status === "fulfilled" && result.value !== null ? [result.value] : []);
  }
}

/** Equal-looking paths on unrelated remote machines must never be treated as one configuration. */
function sourceFilesystemSpace(source: CachedSource): string | null {
  if (source.kind === "local" || (source.kind === "custom" && source.settings.hasLocalAccess)) return "host";
  if (source.kind === "wsl" && source.settings.distro !== null) return `wsl:${source.settings.distro}`;
  if (source.kind === "ssh" && source.settings.user !== null) {
    return JSON.stringify(["ssh", source.settings.host, source.settings.port ?? 22, source.settings.user]);
  }
  return null;
}
