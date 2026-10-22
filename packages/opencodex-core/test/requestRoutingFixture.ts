import type { OpenCodexBackendRuntime } from "../src/OpenCodexBackendRuntime";

/** Supplies the source-activity boundary for tests that exercise only request dispatch. */
export function requestRoutingRuntime(runtime: OpenCodexBackendRuntime): OpenCodexBackendRuntime {
  return Object.assign(runtime, {
    runWorkspaceRequest: async (_request: unknown, action: () => Promise<unknown>) => await action()
  });
}
