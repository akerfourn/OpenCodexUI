import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexEvent,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexBackendOptions } from "../types.js";
import { parseProjectTrustWarning } from "./trustWarnings.js";

export type ProjectTrustServiceOptions = {
  backendOptions: OpenCodexBackendOptions;
  getSettings(): OpenCodexSettings;
  emit(event: OpenCodexEvent): void;
  ensureClient(sourceId: string | null): Promise<CodexAppServerClient>;
};

export class ProjectTrustService {
  private readonly stderrBufferBySourceId = new Map<string, string>();
  private readonly sourceIdByProjectPath = new Map<string, string>();

  constructor(private readonly options: ProjectTrustServiceOptions) {}

  async trustProject(projectPath: string): Promise<{ ok: true }> {
    const normalizedProjectPath = projectPath.trim();

    if (normalizedProjectPath.length === 0) {
      return { ok: true };
    }

    const sourceId = this.sourceIdByProjectPath.get(normalizedProjectPath)
      ?? this.options.getSettings().defaultSourceId;
    const client = await this.options.ensureClient(sourceId);

    await client.request("config/batchWrite", {
      edits: [
        {
          keyPath: `projects.${normalizedProjectPath}.trust_level`,
          value: "trusted",
          mergeStrategy: "upsert"
        }
      ],
      reloadUserConfig: true
    });

    this.options.emit({
      type: "project.trust.completed",
      projectPath: normalizedProjectPath
    });
    this.sourceIdByProjectPath.delete(normalizedProjectPath);

    return { ok: true };
  }

  dismissProjectTrustRequest(projectPath: string): void {
    const normalizedProjectPath = projectPath.trim();

    if (normalizedProjectPath.length === 0) {
      return;
    }

    this.options.emit({
      type: "project.trust.completed",
      projectPath: normalizedProjectPath
    });
    this.sourceIdByProjectPath.delete(normalizedProjectPath);
  }

  handleCodexStderr(message: string, sourceId: string): void {
    const previousBuffer = this.stderrBufferBySourceId.get(sourceId) ?? "";
    const nextBuffer = `${previousBuffer}\n${message}`.slice(-8000);
    this.stderrBufferBySourceId.set(sourceId, nextBuffer);

    const trustWarning = parseProjectTrustWarning(
      nextBuffer,
      this.options.backendOptions.projectPath
    );

    if (trustWarning === null) {
      return;
    }

    this.stderrBufferBySourceId.set(sourceId, "");
    this.sourceIdByProjectPath.set(trustWarning.projectPath, sourceId);
    this.options.emit({
      type: "project.trust.required",
      projectPath: trustWarning.projectPath,
      disabledFolders: trustWarning.disabledFolders
    });
  }
}
