/** Provides visibility-aware polling for the active Docker Compose panel. */
import { useEffect } from "react";

import type { OpenCodexDockerComposeService } from "@open-codex-ui/opencodex-protocol";

import type { ProjectComposeStore } from "../../stores/project/ProjectComposeStore";

/** Refreshes a stable Compose panel at most once every thirty seconds. */
export const COMPOSE_REFRESH_INTERVAL_MS = 30_000;
/** Refreshes transient Compose states often enough to follow health transitions. */
export const COMPOSE_TRANSIENT_REFRESH_INTERVAL_MS = 10_000;
/** Treats a snapshot older than this value as stale when opening the panel. */
export const COMPOSE_SNAPSHOT_STALE_AFTER_MS = 30_000;

/**
 * Returns whether a snapshot must be refreshed for the current visible panel.
 *
 * @param lastLoadedAt Unix timestamp of the last successful snapshot, or null.
 * @param now Current Unix timestamp used by the caller.
 * @returns Whether the snapshot is missing or at least thirty seconds old.
 */
export function shouldRefreshComposeSnapshot(
  lastLoadedAt: number | null | undefined,
  now: number
): boolean {
  if (lastLoadedAt === null || lastLoadedAt === undefined) {
    return true;
  }

  return now - lastLoadedAt >= COMPOSE_SNAPSHOT_STALE_AFTER_MS;
}

/**
 * Chooses a polling interval based on whether Compose is in a transient state.
 *
 * @param services Latest service summaries exposed by the Compose snapshot.
 * @returns Polling interval in milliseconds.
 */
export function readComposePollingInterval(
  services: readonly OpenCodexDockerComposeService[]
): number {
  const hasTransientService = services.some((service) => {
    if (service.state === "partial" || service.state === "unknown") {
      return true;
    }

    return service.containers.some((container) =>
      container.state.toLowerCase() === "restarting" ||
      container.health.toLowerCase() === "starting"
    );
  });

  return hasTransientService
    ? COMPOSE_TRANSIENT_REFRESH_INTERVAL_MS
    : COMPOSE_REFRESH_INTERVAL_MS;
}

/**
 * Polls the Compose store while its panel is mounted and the window is visible.
 *
 * The side-panel parent mounts this component only for the selected Compose tab,
 * so unmounting also stops the project-scoped polling timer.
 *
 * @param composeStore Store owned by the currently visible project panel.
 */
export function useProjectComposePolling(composeStore: ProjectComposeStore): void {
  const refreshIntervalMs = readComposePollingInterval(composeStore.services);

  useEffect(() => {
    if (!composeStore.isAvailable) {
      return undefined;
    }

    let timeoutId: number | null = null;
    let isDisposed = false;

    function isWindowVisible(): boolean {
      return document.visibilityState === "visible";
    }

    function clearScheduledRefresh(): void {
      if (timeoutId === null) {
        return;
      }

      window.clearTimeout(timeoutId);
      timeoutId = null;
    }

    function refreshIfStale(): void {
      if (isDisposed || !isWindowVisible() || !composeStore.isAvailable) {
        return;
      }

      if (shouldRefreshComposeSnapshot(composeStore.lastLoadedAt, Date.now())) {
        void composeStore.load();
      }
    }

    function scheduleNextRefresh(): void {
      if (isDisposed || timeoutId !== null || !isWindowVisible()) {
        return;
      }

      timeoutId = window.setTimeout(() => {
        timeoutId = null;
        refreshIfStale();
        scheduleNextRefresh();
      }, refreshIntervalMs);
    }

    function handleVisibilityChange(): void {
      if (!isWindowVisible()) {
        clearScheduledRefresh();
        return;
      }

      refreshIfStale();
      scheduleNextRefresh();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    refreshIfStale();
    scheduleNextRefresh();

    return () => {
      isDisposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      clearScheduledRefresh();
    };
  }, [
    composeStore,
    composeStore.isAvailable,
    composeStore.lastLoadedAt,
    refreshIntervalMs
  ]);
}
