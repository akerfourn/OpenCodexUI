import { vi } from "vitest";
import type { SourceInstanceSnapshot } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../src/stores/RootStore";
import { SourceInstancesStore } from "../src/stores/app/SourceInstancesStore";

/** Plain lifecycle metadata; no real processes or transport initialization. */
export function instanceSnapshot(patch: Partial<SourceInstanceSnapshot> = {}): SourceInstanceSnapshot {
  return { sourceId: "a", phase: "ready", isActive: false, manuallyStopped: false, error: null, ...patch };
}

/** The real observable store behind a minimal, controlled transport. */
export function instanceStore() {
  const request = vi.fn(async (_request: unknown): Promise<unknown> => undefined);
  const root = { request } as unknown as RootStore;
  const instances = new SourceInstancesStore(root);
  instances.handleEvent({ type: "sourceInstances.changed", snapshot: instanceSnapshot() });
  return { instances, request };
}
