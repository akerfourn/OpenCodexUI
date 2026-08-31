import type { OpenCodexRendererActivityState } from "@open-codex-ui/opencodex-protocol";

/**
 * Validates the content-free renderer state received through Electron IPC.
 *
 * @param value Candidate renderer payload.
 * @returns Safe activity state, or `null` when the payload is invalid.
 */
export function readRendererActivityState(
  value: unknown
): OpenCodexRendererActivityState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const state = value as Record<string, unknown>;

  if (typeof state.hasPendingProjectActivity !== "boolean") {
    return null;
  }

  return {
    hasPendingProjectActivity: state.hasPendingProjectActivity
  };
}
