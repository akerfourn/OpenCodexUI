import path from "node:path";
import type { OpenCodexCacheRepository } from "@open-codex-ui/opencodex-cache";
import { supportsBrowserPermissions, type BrowserPermissionsContext,
  type BrowserPermissionsRequest, type BrowserPermissionsSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { ClientPort, ProjectSourcePort } from "../runtime/runtimePorts.js";
import { changeBrowserPermission } from "./browserPermissionsFormat.js";
import { readBrowserPermissionsFile, writeBrowserPermissionsFile } from "./browserPermissionsFiles.js";

/** Narrow view of the app-server's config layers, used to locate its actual Codex home. */
interface ConfigLayersResponse {
  layers: { name: { type: string; file?: string; profile?: string | null } }[] | null;
}

/** Manages saved browser rules only in explicitly accessible source-owned files. */
export class BrowserPermissionsService {
  /** Serializes edits, including different sources that share the same Codex home. */
  private mutations: Promise<unknown> = Promise.resolve();

  /** Receives source identity, thread ownership and safe connection reload dependencies. */
  constructor(
    private readonly cache: Pick<OpenCodexCacheRepository, "getThread"> | null,
    private readonly sources: Pick<ProjectSourcePort, "resolveRequestedSource">,
    private readonly clients: Pick<ClientPort, "ensureClient" | "restartClient">,
    private readonly hasActiveTurns: () => boolean
  ) {}

  /** Dispatches reads independently while ordering mutations and connection reloads. */
  async execute(request: BrowserPermissionsRequest): Promise<BrowserPermissionsSnapshot | void> {
    if (request.type === "browserPermissions.read") return await this.perform(request);
    const operation = this.mutations.then(() => this.perform(request));
    this.mutations = operation.catch(() => undefined);
    return await operation;
  }

  /** Validates ownership again for every request instead of trusting a renderer path. */
  private async perform(request: BrowserPermissionsRequest): Promise<BrowserPermissionsSnapshot | void> {
    if (request.type === "browserPermissions.reload") {
      await this.requireSource(request.sourceId);
      if (this.hasActiveTurns()) throw new Error("BROWSER_BUSY: Wait for active turns before reloading Codex.");
      await this.clients.restartClient(request.sourceId);
      return;
    }
    const { context } = request;
    await this.requireContext(context);
    const directory = await this.readBrowserDirectory(context.sourceId);
    const globalPath = path.join(directory, "config.toml");
    let filePath = globalPath;
    if (context.threadId !== null) filePath = path.join(directory, "sessions", `${context.threadId}.toml`);
    const original = await readBrowserPermissionsFile(filePath);
    const global = context.threadId === null ? null : (await readBrowserPermissionsFile(globalPath)).file;
    if (request.type === "browserPermissions.change") {
      if (original.file.revision !== request.revision) {
        throw new Error("BROWSER_CONFLICT: Permissions changed. Refresh before saving.");
      }
      const content = changeBrowserPermission(original.content ?? "", request.change);
      await writeBrowserPermissionsFile(original, content);
    }
    const file = (await readBrowserPermissionsFile(filePath)).file;
    return { context: { ...context }, file, global };
  }

  /** Rejects unsupported source types even when a request bypasses the visible menu. */
  private async requireSource(sourceId: string): Promise<void> {
    if (typeof sourceId !== "string" || sourceId.trim().length === 0) {
      throw new Error("BROWSER_INVALID: An explicit source is required.");
    }
    const source = await this.sources.resolveRequestedSource(sourceId);
    if (!supportsBrowserPermissions(source)) {
      throw new Error("BROWSER_UNSUPPORTED: Browser settings require a source with local file access.");
    }
  }

  /** Prevents path traversal and editing a conversation belonging to another source. */
  private async requireContext(context: BrowserPermissionsContext): Promise<void> {
    await this.requireSource(context.sourceId);
    if (context.threadId === null) return;
    if (typeof context.threadId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(context.threadId)) {
      throw new Error("BROWSER_INVALID: Invalid browser session identifier.");
    }
    const snapshot = await this.cache?.getThread(context.threadId, { latestTurnLimit: 1 });
    if (snapshot === null || snapshot === undefined || snapshot.thread.sourceId !== context.sourceId) {
      throw new Error("BROWSER_INVALID: Conversation unavailable or its source changed.");
    }
  }

  /** Uses the source-reported base user config instead of guessing a host home directory. */
  private async readBrowserDirectory(sourceId: string): Promise<string> {
    const client = await this.clients.ensureClient(sourceId);
    const response = await client.request<ConfigLayersResponse>("config/read", { includeLayers: true });
    const layer = response.layers?.find(candidate => candidate.name.type === "user" &&
      (candidate.name.profile === null || candidate.name.profile === undefined));
    const configPath = layer?.name.file;
    if (typeof configPath !== "string" || !path.isAbsolute(configPath) || path.basename(configPath) !== "config.toml") {
      throw new Error("BROWSER_UNSUPPORTED: Codex did not expose an accessible user configuration path.");
    }
    return path.join(path.dirname(configPath), "browser");
  }
}
