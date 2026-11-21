import type { DockerCommandExecutor } from "./command.js";
import { runChecked } from "./execution.js";
import type { DockerAvailability, DockerVersion } from "./models.js";
import { parseDockerVersion } from "./parsing.js";
import { describeDockerFailure } from "./availability.js";

const VERSION_TEMPLATE = [
  "{\"clientVersion\":{{json .Client.Version}},",
  "\"serverVersion\":{{json .Server.Version}},",
  "\"serverApiVersion\":{{json .Server.APIVersion}}}"
].join("");

/** Provides Docker CLI and daemon availability information. */
export class DockerSystemClient {
  /** Creates a Docker system client. */
  constructor(
    private readonly executor: DockerCommandExecutor,
    private readonly command: string
  ) {}

  /** Reads client and daemon versions for the active Docker context. */
  async version(): Promise<DockerVersion> {
    const result = await runChecked(this.executor, {
      command: this.command,
      args: ["version", "--format", VERSION_TEMPLATE],
      timeoutMs: 10_000
    });

    return parseDockerVersion(result.stdout);
  }

  /** Probes Docker without throwing when the CLI or daemon is unavailable. */
  async availability(): Promise<DockerAvailability> {
    try {
      return { available: true, version: await this.version() };
    } catch (error: unknown) {
      return describeDockerFailure(error, "docker-version");
    }
  }

  /** Checks the Compose plugin independently of any project configuration. */
  async composeVersion(): Promise<string> {
    const result = await runChecked(this.executor, {
      command: this.command,
      args: ["compose", "version", "--short"],
      timeoutMs: 10_000
    });
    return result.stdout.trim();
  }
}
