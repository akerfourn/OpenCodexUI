import type { OpenCodexEvent } from "@open-codex-ui/opencodex-protocol";

import type { OpenCodexClientPool } from "./OpenCodexClientPool.js";
import type { RuntimeNotificationCoordinator } from "./RuntimeNotificationCoordinator.js";
import type { RuntimeEventPort } from "./runtimePorts.js";

/** Dependencies used by the client-close lifecycle callback. */
export type ClientCloseHandlerOptions = {
  /** Flushes and clears source-scoped notification state. */
  notifications: Pick<
    RuntimeNotificationCoordinator,
    "flushSource" | "clearSourceActiveTurns"
  >;
  /** Removes clients and reports whether any source remains connected. */
  clients: Pick<OpenCodexClientPool, "deleteClient" | "hasClients">;
  /** Emits the stopped state when the last client closes. */
  events: Pick<RuntimeEventPort, "emit">;
};

/**
 * Completes source cleanup after a Codex client closes.
 *
 * @param sourceId Closed source identifier.
 * @param options Notification, client, and event dependencies.
 * @returns Nothing.
 */
export function handleClientClose(
  sourceId: string,
  options: ClientCloseHandlerOptions
): void {
  options.notifications.flushSource(sourceId);
  options.clients.deleteClient(sourceId);
  options.notifications.clearSourceActiveTurns(sourceId);

  if (!options.clients.hasClients()) {
    const event: OpenCodexEvent = { type: "connection.status", status: "stopped" };
    options.events.emit(event);
  }
}
