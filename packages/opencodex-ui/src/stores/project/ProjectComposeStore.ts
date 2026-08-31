/**
 * Holds the Docker Compose state associated with one opened project.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexDockerComposeLogs,
  OpenCodexDockerComposeSnapshot
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "../RootStore";

type ComposeServiceAction = "up" | "stop" | "restart";
type ComposeActionRequestType =
  | "docker.compose.service.up"
  | "docker.compose.service.stop"
  | "docker.compose.service.restart";

/**
 * Stores bounded Compose discovery, service actions, and logs for one project.
 */
export class ProjectComposeStore {
  /** Latest Compose project snapshot, or `null` before the first read. */
  snapshot: OpenCodexDockerComposeSnapshot | null = null;
  /** Service whose detail section is selected. */
  selectedServiceName: string | null = null;
  /** Logs loaded for the selected service. */
  selectedLogs: OpenCodexDockerComposeLogs | null = null;
  /** Whether the Compose snapshot has been requested successfully. */
  hasLoaded = false;
  /** Whether a Compose snapshot request is active. */
  isLoading = false;
  /** Unix timestamp of the last successfully applied Compose snapshot. */
  lastLoadedAt: number | null = null;
  /** Whether logs for the selected service are being read. */
  isLoadingLogs = false;
  /** Whether the bounded selected-service log dialog is open. */
  isLogsOpen = false;
  /** Services with a lifecycle action currently in flight. */
  pendingServiceNames = new Set<string>();
  /** Last snapshot or action error. */
  errorMessage: string | null = null;
  /** Last error scoped to the selected service logs. */
  logsErrorMessage: string | null = null;
  /** Monotonically increasing identity for snapshot requests. */
  private snapshotRequestId = 0;
  /** Current snapshot request, used to coalesce passive refreshes. */
  private snapshotRequest: Promise<void> | null = null;
  /** Monotonically increasing identity for log requests. */
  private logsRequestId = 0;
  /** Monotonically increasing identity for project resets. */
  private projectIdentityId = 0;
  /** Monotonically increasing identity for service actions. */
  private serviceActionId = 0;
  /** Request token for each pending service action. */
  private pendingServiceTokens = new Map<string, number>();

  /** Creates project-scoped Compose state. */
  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<
      ProjectComposeStore,
      "projectStore" | "root" | "snapshotRequest"
    >(this, {
      projectStore: false,
      root: false,
      snapshotRequest: false
    });
  }

  /** Returns whether the project has a detected Compose file. */
  get hasComposeFile(): boolean {
    return this.snapshot?.composeFile !== null && this.snapshot?.composeFile !== undefined;
  }

  /** Returns whether the owning Codex source is ready for Compose operations. */
  get isAvailable(): boolean {
    const sourceId = this.projectStore.project.sourceId;
    return sourceId !== null && sourceId !== undefined && this.projectStore.isCodexSourceReady;
  }

  /** Clears stale Compose state once when its owning source becomes unavailable. */
  invalidateIfUnavailable(): void {
    if (this.isAvailable) {
      return;
    }

    const hasState = this.snapshot !== null || this.hasLoaded || this.isLoading ||
      this.lastLoadedAt !== null ||
      this.pendingServiceNames.size > 0 || this.selectedServiceName !== null ||
      this.selectedLogs !== null || this.isLogsOpen || this.errorMessage !== null ||
      this.logsErrorMessage !== null;

    if (hasState) {
      this.reset();
    }
  }

  /** Returns the services from the latest snapshot. */
  get services(): OpenCodexDockerComposeSnapshot["services"] {
    return this.snapshot?.services ?? [];
  }

  /** Returns the currently selected service, if any. */
  get selectedService(): OpenCodexDockerComposeSnapshot["services"][number] | null {
    if (this.selectedServiceName === null) {
      return null;
    }

    return this.services.find((service) => service.name === this.selectedServiceName) ?? null;
  }

  /** Reads Compose metadata and the current service states. */
  async load(options: { force?: boolean } = {}): Promise<void> {
    const sourceId = this.projectStore.project.sourceId;
    const projectPath = this.projectStore.projectPath;

    if (sourceId === null || sourceId === undefined) {
      this.reset();
      return;
    }

    if (!this.isAvailable) {
      this.reset();
      return;
    }

    if (this.isLoading && !options.force && this.snapshotRequest !== null) {
      await this.snapshotRequest;
      return;
    }

    const requestId = ++this.snapshotRequestId;
    this.isLoading = true;
    this.errorMessage = null;
    const request = this.readSnapshot(requestId, projectPath, sourceId);
    this.snapshotRequest = request;

    try {
      await request;
    } finally {
      if (this.snapshotRequest === request) {
        this.snapshotRequest = null;
      }
    }
  }

  /** Selects a service and clears logs from a previous selection. */
  selectService(serviceName: string): void {
    this.logsRequestId += 1;
    this.selectedServiceName = serviceName;
    this.selectedLogs = null;
    this.logsErrorMessage = null;
    this.isLogsOpen = false;
  }

  /** Clears the selected service and its log state. */
  clearSelection(): void {
    this.logsRequestId += 1;
    this.selectedServiceName = null;
    this.selectedLogs = null;
    this.isLoadingLogs = false;
    this.logsErrorMessage = null;
    this.isLogsOpen = false;
  }

  /** Starts or creates one Compose service through `docker compose up`. */
  async up(serviceName: string): Promise<void> {
    await this.runAction("up", serviceName);
  }

  /** Stops one Compose service. */
  async stop(serviceName: string): Promise<void> {
    await this.runAction("stop", serviceName);
  }

  /** Restarts one Compose service. */
  async restart(serviceName: string): Promise<void> {
    await this.runAction("restart", serviceName);
  }

  /** Opens the selected service logs using a bounded backend response. */
  async openLogs(serviceName: string): Promise<void> {
    const sourceId = this.projectStore.project.sourceId;
    const projectPath = this.projectStore.projectPath;

    if (sourceId === null || sourceId === undefined || !this.isAvailable) {
      return;
    }

    const requestId = ++this.logsRequestId;
    this.selectedServiceName = serviceName;
    this.selectedLogs = null;
    this.logsErrorMessage = null;
    this.isLoadingLogs = true;
    this.isLogsOpen = true;

    try {
      const logs = await this.root.request<OpenCodexDockerComposeLogs>({
        type: "docker.compose.service.logs.read",
        projectPath,
        sourceId,
        serviceName,
        tail: 200
      });

      runInAction(() => {
        if (this.isCurrentLogsRequest(requestId, projectPath, sourceId, serviceName)) {
          this.selectedLogs = logs;
          this.isLoadingLogs = false;
        }
      });
    } catch (error: unknown) {
      runInAction(() => {
        if (this.isCurrentLogsRequest(requestId, projectPath, sourceId, serviceName)) {
          this.logsErrorMessage = readErrorMessage(error);
          this.isLoadingLogs = false;
        }
      });
    }
  }

  /** Closes and discards the selected service logs. */
  closeLogs(): void {
    this.logsRequestId += 1;
    this.selectedLogs = null;
    this.isLoadingLogs = false;
    this.logsErrorMessage = null;
    this.isLogsOpen = false;
  }

  /** Returns whether a service currently has a lifecycle request in flight. */
  isServicePending(serviceName: string): boolean {
    return this.pendingServiceNames.has(serviceName);
  }

  /** Resets discovery state when the owning project changes or becomes orphaned. */
  reset(): void {
    this.projectIdentityId += 1;
    this.snapshotRequestId += 1;
    this.logsRequestId += 1;
    this.snapshot = null;
    this.hasLoaded = false;
    this.isLoading = false;
    this.lastLoadedAt = null;
    this.errorMessage = null;
    this.pendingServiceNames.clear();
    this.pendingServiceTokens.clear();
    this.clearSelection();
  }

  /** Executes a service action and refreshes the service state afterwards. */
  private async runAction(action: ComposeServiceAction, serviceName: string): Promise<void> {
    const sourceId = this.projectStore.project.sourceId;
    const projectPath = this.projectStore.projectPath;

    if (sourceId === null || sourceId === undefined || !this.isAvailable ||
      this.pendingServiceNames.has(serviceName)) {
      return;
    }

    const projectIdentityId = this.projectIdentityId;
    const serviceActionId = ++this.serviceActionId;
    this.pendingServiceNames.add(serviceName);
    this.pendingServiceTokens.set(serviceName, serviceActionId);
    this.errorMessage = null;

    try {
      await this.root.request({
        type: composeActionRequestTypes[action],
        projectPath,
        sourceId,
        serviceName
      });
      if (this.isCurrentProject(projectPath, sourceId, projectIdentityId)) {
        await this.load({ force: true });
      }
    } catch (error: unknown) {
      if (this.isCurrentProject(projectPath, sourceId, projectIdentityId)) {
        runInAction(() => {
          this.errorMessage = readErrorMessage(error);
        });
      }
    } finally {
      runInAction(() => {
        if (this.pendingServiceTokens.get(serviceName) === serviceActionId) {
          this.pendingServiceTokens.delete(serviceName);
          this.pendingServiceNames.delete(serviceName);
        }
      });
    }
  }

  /** Keeps selection valid when a refreshed snapshot no longer contains it. */
  private clearSelectionIfMissing(): void {
    if (this.snapshot?.composeFile === null ||
      (this.selectedServiceName !== null && this.selectedService === null)) {
      this.clearSelection();
    }
  }

  /** Reads one snapshot and applies it only while its project identity remains current. */
  private async readSnapshot(
    requestId: number,
    projectPath: string,
    sourceId: string
  ): Promise<void> {
    try {
      const snapshot = await this.root.request<OpenCodexDockerComposeSnapshot>({
        type: "docker.compose.snapshot.read",
        projectPath,
        sourceId
      });

      runInAction(() => {
        if (!this.isCurrentSnapshotRequest(requestId, projectPath, sourceId)) {
          return;
        }

        this.snapshot = snapshot;
        this.hasLoaded = true;
        this.isLoading = false;
        this.lastLoadedAt = Date.now();
        this.clearSelectionIfMissing();
      });
    } catch (error: unknown) {
      runInAction(() => {
        if (!this.isCurrentSnapshotRequest(requestId, projectPath, sourceId)) {
          return;
        }

        this.errorMessage = readErrorMessage(error);
        this.isLoading = false;
      });
    }
  }

  /** Returns whether a snapshot response still belongs to the active project. */
  private isCurrentSnapshotRequest(
    requestId: number,
    projectPath: string,
    sourceId: string
  ): boolean {
    return this.snapshotRequestId === requestId &&
      this.isCurrentProject(projectPath, sourceId, this.projectIdentityId);
  }

  /** Returns whether the selected project still owns a request. */
  private isCurrentProject(
    projectPath: string,
    sourceId: string,
    projectIdentityId = this.projectIdentityId
  ): boolean {
    return this.projectStore.projectPath === projectPath &&
      this.projectStore.project.sourceId === sourceId &&
      this.projectIdentityId === projectIdentityId;
  }

  /** Returns whether a log response still belongs to the selected project and service. */
  private isCurrentLogsRequest(
    requestId: number,
    projectPath: string,
    sourceId: string,
    serviceName: string
  ): boolean {
    return this.logsRequestId === requestId &&
      this.selectedServiceName === serviceName &&
      this.isCurrentProject(projectPath, sourceId);
  }
}

/** Maps lifecycle actions to their exhaustive protocol request types. */
const composeActionRequestTypes: Record<
  ComposeServiceAction,
  ComposeActionRequestType
> = {
  up: "docker.compose.service.up",
  stop: "docker.compose.service.stop",
  restart: "docker.compose.service.restart"
};

/** Converts an unknown request failure to a safe local message. */
function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Docker Compose request failed.";
}
