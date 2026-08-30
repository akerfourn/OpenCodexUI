import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexDockerContainerLogs,
  OpenCodexDockerHostSnapshot,
  OpenCodexRequest
} from "@open-codex-ui/opencodex-protocol";

/** Backend request capability required by host Docker state. */
export interface DockerHostRequestPort {
  request<T = unknown>(request: OpenCodexRequest): Promise<T>;
}

/** Lifecycle actions supported for existing host containers. */
type DockerContainerAction = "start" | "stop" | "restart";

/** Stores the lazy, host-local Docker state displayed on Home. */
export class DockerHostStore {
  /** Last successfully read Docker host snapshot. */
  snapshot: OpenCodexDockerHostSnapshot | null = null;
  /** Logs loaded for the currently selected container. */
  selectedLogs: OpenCodexDockerContainerLogs | null = null;
  /** Container whose log dialog is open. */
  selectedContainerId: string | null = null;
  /** Whether at least one snapshot request completed successfully. */
  hasLoaded = false;
  /** Whether a snapshot request is currently active. */
  isLoading = false;
  /** Whether the selected container logs are loading. */
  isLoadingLogs = false;
  /** Container identifiers with an active lifecycle request. */
  pendingContainerIds = new Set<string>();
  /** Last local Docker request failure. */
  errorMessage: string | null = null;
  /** Last failure limited to the selected log dialog. */
  logsErrorMessage: string | null = null;

  /** Creates the host Docker store. */
  constructor(private readonly root: DockerHostRequestPort) {
    makeAutoObservable<DockerHostStore, "root">(this, { root: false });
  }

  /** Reads Docker availability and existing containers. */
  async load(): Promise<void> {
    if (this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.errorMessage = null;

    try {
      const snapshot = await this.root.request<OpenCodexDockerHostSnapshot>({
        type: "docker.host.snapshot.read"
      });

      runInAction(() => {
        this.snapshot = snapshot;
        this.hasLoaded = true;
        this.isLoading = false;
      });
    } catch (error: unknown) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
        this.isLoading = false;
      });
    }
  }

  /** Starts an existing container and refreshes the host snapshot. */
  async start(containerId: string): Promise<void> {
    await this.runAction("start", containerId);
  }

  /** Stops a running container and refreshes the host snapshot. */
  async stop(containerId: string): Promise<void> {
    await this.runAction("stop", containerId);
  }

  /** Restarts an existing container and refreshes the host snapshot. */
  async restart(containerId: string): Promise<void> {
    await this.runAction("restart", containerId);
  }

  /** Opens the log dialog and loads the latest bounded log tail. */
  async openLogs(containerId: string): Promise<void> {
    this.selectedContainerId = containerId;
    this.selectedLogs = null;
    this.isLoadingLogs = true;
    this.logsErrorMessage = null;

    try {
      const logs = await this.root.request<OpenCodexDockerContainerLogs>({
        type: "docker.host.container.logs.read",
        containerId,
        tail: 200
      });

      runInAction(() => {
        if (this.selectedContainerId === containerId) {
          this.selectedLogs = logs;
          this.isLoadingLogs = false;
        }
      });
    } catch (error: unknown) {
      runInAction(() => {
        if (this.selectedContainerId === containerId) {
          this.logsErrorMessage = readErrorMessage(error);
          this.isLoadingLogs = false;
        }
      });
    }
  }

  /** Closes the log dialog and discards its bounded content. */
  closeLogs(): void {
    this.selectedContainerId = null;
    this.selectedLogs = null;
    this.isLoadingLogs = false;
    this.logsErrorMessage = null;
  }

  /** Returns whether one container currently has a lifecycle request. */
  isContainerPending(containerId: string): boolean {
    return this.pendingContainerIds.has(containerId);
  }

  /** Executes one lifecycle request while preserving per-container pending state. */
  private async runAction(action: DockerContainerAction, containerId: string): Promise<void> {
    if (this.pendingContainerIds.has(containerId)) {
      return;
    }

    this.pendingContainerIds.add(containerId);
    this.errorMessage = null;

    try {
      await this.root.request({
        type: `docker.host.container.${action}`,
        containerId
      });
      await this.load();
    } catch (error: unknown) {
      runInAction(() => {
        this.errorMessage = readErrorMessage(error);
      });
    } finally {
      runInAction(() => {
        this.pendingContainerIds.delete(containerId);
      });
    }
  }
}

/** Converts unknown transport failures to displayable local messages. */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Docker request failed.";
}
