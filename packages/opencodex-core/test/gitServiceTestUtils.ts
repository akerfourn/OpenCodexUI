import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import { expect } from "vitest";

import { GitService } from "../src/backend/GitService";

export type FakeProcessResponse = Pick<
  v2.ProcessExitedNotification,
  "exitCode" | "stdout" | "stderr"
>;

type FakeNotificationListener = (notification: {
  method: string;
  params: v2.ProcessExitedNotification;
}) => void;

/** Provides deterministic Codex process and filesystem responses to Git tests. */
export class FakeCodexClient {
  /** Records the Git commands requested by the service. */
  readonly commands: string[][] = [];

  /** Stores fake file contents keyed by their source path. */
  readonly filesByPath = new Map<string, string>();

  /** Stores fake filesystem metadata keyed by their source path. */
  readonly metadataByPath = new Map<string, v2.FsGetMetadataResponse>();

  private readonly listeners = new Set<FakeNotificationListener>();

  /** Creates a fake client with the ordered process responses for the test. */
  constructor(private readonly responses: FakeProcessResponse[]) {}

  /** Exposes the fake as the app-server client expected by GitService. */
  asCodexClient(): CodexAppServerClient {
    return this as unknown as CodexAppServerClient;
  }

  /** Registers a process-exit listener and returns its disposable handle. */
  onNotification(listener: FakeNotificationListener): { dispose(): void } {
    this.listeners.add(listener);

    return {
      dispose: () => {
        this.listeners.delete(listener);
      }
    };
  }

  /** Handles the process and filesystem requests used by GitService. */
  async request<TResponse>(
    method: string,
    params: v2.ProcessSpawnParams | v2.FsGetMetadataParams | v2.FsReadFileParams
  ): Promise<TResponse> {
    if (method === "fs/getMetadata") {
      return this.getMetadata(params as v2.FsGetMetadataParams) as TResponse;
    }

    if (method === "fs/readFile") {
      return this.readFile(params as v2.FsReadFileParams) as TResponse;
    }

    expect(method).toBe("process/spawn");
    const processParams = params as v2.ProcessSpawnParams;
    this.commands.push([...processParams.command]);
    const response = this.responses.shift();

    if (response === undefined) {
      throw new Error("No fake Git response configured.");
    }

    queueMicrotask(() => {
      const notification = {
        method: "process/exited",
        params: {
          processHandle: processParams.processHandle,
          exitCode: response.exitCode,
          stdout: response.stdout,
          stdoutCapReached: false,
          stderr: response.stderr,
          stderrCapReached: false
        }
      };

      for (const listener of this.listeners) {
        listener(notification);
      }
    });

    return {} as TResponse;
  }

  /** Returns configured fake metadata for a filesystem path. */
  private getMetadata(params: v2.FsGetMetadataParams): v2.FsGetMetadataResponse {
    const metadata = this.metadataByPath.get(params.path);

    if (metadata === undefined) {
      throw new Error(`No fake metadata configured for ${params.path}.`);
    }

    return metadata;
  }

  /** Returns configured fake file contents for a filesystem path. */
  private readFile(params: v2.FsReadFileParams): v2.FsReadFileResponse {
    const content = this.filesByPath.get(params.path);

    if (content === undefined) {
      throw new Error(`No fake file configured for ${params.path}.`);
    }

    return {
      dataBase64: Buffer.from(content, "utf8").toString("base64")
    };
  }
}

/** Creates a GitService connected to the supplied fake Codex client. */
export function createGitService(client: FakeCodexClient): GitService {
  return new GitService({
    clients: { ensureClient: async () => client.asCodexClient() }
  });
}
