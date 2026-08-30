/** Docker CLI and daemon availability reported by the desktop host. */
export type OpenCodexDockerAvailability =
  | {
      available: true;
      clientVersion: string;
      serverVersion: string;
      serverApiVersion: string;
    }
  | {
      available: false;
      message: string;
    };

/** Display-safe summary of one container in the host Docker context. */
export interface OpenCodexDockerContainer {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
}

/** Complete bounded state used by the Home Docker section. */
export interface OpenCodexDockerHostSnapshot {
  availability: OpenCodexDockerAvailability;
  containers: OpenCodexDockerContainer[];
}

/** Bounded stdout and stderr logs read for one Docker container. */
export interface OpenCodexDockerContainerLogs {
  containerId: string;
  stdout: string;
  stderr: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}
