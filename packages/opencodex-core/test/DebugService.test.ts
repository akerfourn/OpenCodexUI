import { describe, test, expect, vi } from "vitest";
import type { DebugConfiguration, DebugSnapshot } from "@open-codex-ui/opencodex-protocol";
import { DebugService } from "../src/backend/debug/DebugService.js";

const context = { sourceId: "local", projectId: "project", workspaceId: "one", workspacePath: "/project" };
const config: DebugConfiguration = { id: "config", name: "Node", adapter: "javascript", target: "node",
  request: "launch", program: "test.js", context };

/** Isolates database writes while exercising session and workspace behavior. */
async function fixture(validate = vi.fn(async () => undefined)) {
  const update = vi.fn(async () => undefined);
  const repository = {
    read: vi.fn(async () => ({ configurations: [config], breakpoints: [], watches: [] })),
    importLegacy: vi.fn(async () => undefined),
    saveConfiguration: vi.fn(async () => undefined),
    deleteConfiguration: vi.fn(async () => undefined),
    replaceBreakpoints: update,
    replaceWatches: vi.fn(async () => undefined)
  };
  const service = new DebugService(repository, validate, vi.fn(), {
    executable: "unused", entrypoint: "/missing/opencodex-debug-test.js"
  });
  await service.initialize();
  return { service, update, validate, repository };
}
describe("debug service", () => {
  test("rejects unsupported advanced fields and preserves the saved profile when persistence fails", async () => {
    const { service, repository } = await fixture();
    await expect(service.execute({ kind: "saveConfiguration",
      configuration: { ...config, advanced: { console: "integratedTerminal" } } as DebugConfiguration
    })).rejects.toThrow("Unsupported advanced option: console");
    expect(repository.saveConfiguration).not.toHaveBeenCalled();
    repository.saveConfiguration.mockRejectedValueOnce(new Error("Disk full"));
    await expect(service.execute({ kind: "saveConfiguration", configuration: {
      ...config, advanced: { envFile: ".env", stopOnEntry: true }
    } })).rejects.toThrow("Disk full");
    expect(service.snapshot().preferences.configurations).toEqual([config]);
    await service.dispose();
  });
  test("reserves the session slot before asynchronous validation and recovers after failure", async () => {
    let validate!: () => void;
    const { service } = await fixture(vi.fn(() => new Promise<void>(resolve => { validate = resolve; })));
    const first = service.execute({ kind: "start", configurationId: "config" });
    const original = service.snapshot().session!.id;
    await expect(service.execute({ kind: "start", configurationId: "config" })).rejects.toThrow("already active");
    validate(); await first;
    expect(service.snapshot().session?.state).toBe("failed");
    const second = service.execute({ kind: "start", configurationId: "config" });
    expect(service.snapshot().session?.id).not.toBe(original);
    validate(); await second;
    await expect(service.execute({ kind: "stop", sessionId: original })).rejects.toThrow("expired");
    await service.dispose();
  });
  test("rejects unavailable/non-local contexts before any launch and preserves persisted configurations", async () => {
    const { service } = await fixture(vi.fn(async () => { throw new Error("Local sources only"); }));
    const result = await service.execute({ kind: "start", configurationId: "config" }) as DebugSnapshot;
    expect(result.session).toMatchObject({ state: "failed", error: "Error: Local sources only" });
    expect(result.preferences.configurations).toEqual([config]);
    await service.dispose();
  });
  test("keeps breakpoint updates scoped and preserves old preferences on failed persistence", async () => {
    const { service, update } = await fixture();
    await service.execute({ kind: "breakpoints", context, breakpoints: [
      { id: "one", context, path: "file.ts", line: 1, enabled: true }
    ] });
    const other = { ...context, workspaceId: "two" };
    await service.execute({ kind: "breakpoints", context: other, breakpoints: [
      { id: "two", context: other, path: "file.ts", line: 2, enabled: true }
    ] });
    update.mockRejectedValueOnce(new Error("Disk full"));
    await expect(service.execute({ kind: "breakpoints", context, breakpoints: [] })).rejects.toThrow("Disk full");
    expect(service.snapshot().preferences.breakpoints.map(item => item.id)).toEqual(["one", "two"]);
    await expect(service.execute({ kind: "breakpoints", context, breakpoints: [
      { id: "escape", context, path: "../outside.js", line: 1, enabled: true }
    ] })).rejects.toThrow("Invalid workspace breakpoint");
    await service.dispose();
  });
});
