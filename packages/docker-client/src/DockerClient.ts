import type { DockerCommandExecutor } from "./command.js";
import { DockerComposeClient } from "./DockerComposeClient.js";
import { DockerContainersClient } from "./DockerContainersClient.js";
import { DockerSystemClient } from "./DockerSystemClient.js";
import type { DockerComposeOptions } from "./models.js";

/** Dependencies and executable selection for one Docker client. */
export interface DockerClientOptions {
  /** Transport used to execute Docker commands. */
  executor: DockerCommandExecutor;
  /** Docker CLI executable. Defaults to `docker`, including on Windows. */
  command?: string;
}

/** Typed, stateless facade over Docker and Docker Compose CLI operations. */
export class DockerClient {
  /** Docker CLI and daemon availability operations. */
  readonly system: DockerSystemClient;
  /** Existing global-container operations. */
  readonly containers: DockerContainersClient;
  /** Selected Docker CLI executable. */
  private readonly command: string;
  /** Command execution transport. */
  private readonly executor: DockerCommandExecutor;

  /** Creates a Docker client over an injected execution transport. */
  constructor(options: DockerClientOptions) {
    if (options.command !== undefined && options.command.trim().length === 0) {
      throw new Error("Docker command must not be empty.");
    }

    this.executor = options.executor;
    this.command = options.command ?? "docker";
    this.system = new DockerSystemClient(this.executor, this.command);
    this.containers = new DockerContainersClient(this.executor, this.command);
  }

  /** Creates an immutable client scoped to one Compose project. */
  compose(options: DockerComposeOptions): DockerComposeClient {
    return new DockerComposeClient(this.executor, this.command, options);
  }
}
