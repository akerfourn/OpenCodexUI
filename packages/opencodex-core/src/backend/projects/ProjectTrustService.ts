import type { OpenCodexBackendOptions } from "../../types.js";
import { parseProjectTrustWarning } from "./trustWarnings.js";
import type {
  ClientPort,
  RuntimeEventPort,
  RuntimeSettingsPort
} from "../runtime/runtimePorts.js";

export type ProjectTrustServiceOptions = {
  backendOptions: OpenCodexBackendOptions;
  settings: Pick<RuntimeSettingsPort, "getSettings">;
  events: Pick<RuntimeEventPort, "emit">;
  clients: Pick<ClientPort, "ensureClient">;
};

/**
 * Detects and resolves Codex project trust prompts.
 */
export class ProjectTrustService {
  private readonly stderrBufferBySourceId = new Map<string, string>();
  private readonly sourceIdByProjectPath = new Map<string, string>();

  /**
   * Creates a project trust service.
   *
   * @param options Backend options plus settings, event, and Codex client ports.
   */
  constructor(private readonly options: ProjectTrustServiceOptions) {}

  /**
   * Marks a project as trusted in the owning Codex configuration.
   *
   * @param projectPath Project path to trust.
   *
   * @returns Success result.
   */
  async trustProject(projectPath: string): Promise<{ ok: true }> {
    const normalizedProjectPath = projectPath.trim();

    if (normalizedProjectPath.length === 0) {
      return { ok: true };
    }

    const sourceId = this.sourceIdByProjectPath.get(normalizedProjectPath)
      ?? this.options.settings.getSettings().defaultSourceId;
    const client = await this.options.clients.ensureClient(sourceId);

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

    this.options.events.emit({
      type: "project.trust.completed",
      projectPath: normalizedProjectPath
    });
    this.sourceIdByProjectPath.delete(normalizedProjectPath);

    return { ok: true };
  }

  /**
   * Dismisses a pending trust request.
   *
   * @param projectPath Project path to dismiss.
   *
   * @returns Nothing.
   */
  dismissProjectTrustRequest(projectPath: string): void {
    const normalizedProjectPath = projectPath.trim();

    if (normalizedProjectPath.length === 0) {
      return;
    }

    this.options.events.emit({
      type: "project.trust.completed",
      projectPath: normalizedProjectPath
    });
    this.sourceIdByProjectPath.delete(normalizedProjectPath);
  }

  /**
   * Reads Codex stderr and emits trust requests when warnings are detected.
   *
   * @param message stderr message fragment.
   * @param sourceId Source that produced the message.
   *
   * @returns Nothing.
   */
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
    this.options.events.emit({
      type: "project.trust.required",
      projectPath: trustWarning.projectPath,
      disabledFolders: trustWarning.disabledFolders
    });
  }
}
