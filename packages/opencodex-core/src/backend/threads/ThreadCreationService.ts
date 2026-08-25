import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";

import { normalizeProjectPath } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import { mapThread, readObject, readString } from "../../mapping.js";
import type { OpenCodexBackendOptions } from "../../types.js";
import { readReasoningEffort } from "../shared/codexReaders.js";
import { withSourceId } from "./threadCacheMapping.js";
import type { ProjectSourcePort, RuntimeSettingsPort } from "../runtime/runtimePorts.js";

/** Dependencies required to create a source-owned Codex thread. */
export type ThreadCreationServiceOptions = {
  /** Backend project path used when the request omits one. */
  backendOptions: Pick<OpenCodexBackendOptions, "projectPath">;
  /** Reads the default model for newly created threads. */
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  /** Caches the project associated with the new thread. */
  projects: Pick<ProjectSourcePort, "cacheProject">;
};

/** Creates and maps Codex threads without mutating thread caches or emitting events. */
export class ThreadCreationService {
  /** Creates a thread creation service. */
  constructor(private readonly options: ThreadCreationServiceOptions) {}

  /**
   * Creates one source-owned thread in Codex.
   *
   * @param client Codex client for the owning source.
   * @param projectPath Project path candidate.
   * @param sourceId Source identifier to attach to the mapped thread.
   * @returns Mapped thread metadata.
   */
  async create(
    client: CodexAppServerClient,
    projectPath: string | null,
    sourceId: string
  ): Promise<OpenCodexThread> {
    const currentProjectPath = this.resolveCurrentProjectPath(projectPath);
    await this.options.projects.cacheProject(currentProjectPath, sourceId);
    const response = await client.startThread({
      cwd: currentProjectPath,
      model: this.options.settings.getSettings().defaultModel
    });
    const responseObject = readObject(response);

    return withSourceId(mapThread(
      responseObject.thread,
      readString(responseObject.model),
      readReasoningEffort(responseObject.reasoningEffort)
    ), sourceId);
  }

  /**
   * Resolves a project path with the backend fallback.
   *
   * @param projectPath Project path candidate.
   * @returns Normalized project path, or `null`.
   */
  private resolveCurrentProjectPath(projectPath: string | null): string | null {
    return normalizeProjectPath(projectPath)
      ?? normalizeProjectPath(this.options.backendOptions.projectPath);
  }
}
