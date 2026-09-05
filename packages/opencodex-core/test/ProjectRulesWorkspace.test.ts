import { describe, expect, it, vi } from "vitest";
import type { CachedProjectCommandRuleFileState } from "@open-codex-ui/opencodex-cache";
import {
  ProjectCommandRuleService,
  type ProjectCommandRuleServiceOptions
} from "../src/backend/projects/ProjectCommandRuleService";

/** Source filesystem and persistence doubles keep rule generation deterministic. */
function createService() {
  const files = new Map<string, string>();
  const states = new Map<string, CachedProjectCommandRuleFileState>();
  const emit = vi.fn();
  const options = {
    cacheRepository: {
      listProjects: async () => [{ id: "project", path: "/primary", sourceId: "source" }],
      listProjectCommandRules: async () => [],
      getProjectCommandRuleFileState: async (_projectId: string, path: string) => states.get(path) ?? null,
      saveProjectCommandRuleFileState: async (state: CachedProjectCommandRuleFileState) => {
        states.set(state.generatedPath!, state);
      },
      workspaces: { get: async () => ({ id: "secondary", projectId: "project", sourceId: "source",
        path: "/secondary", isPrimary: false, removedAt: null }) }
    },
    clients: {
      ensureClient: async () => ({
        createDirectory: async () => undefined,
        readFile: async (path: string) => {
          if (!files.has(path)) {
            throw new Error("File not found");
          }
          return { dataBase64: files.get(path) };
        },
        writeFile: async (path: string, data: string) => { files.set(path, data); }
      }),
      restartClient: vi.fn(async () => undefined)
    },
    projects: { resolveSource: async () => ({ id: "source", kind: "local" }) },
    hasActiveTurn: () => false,
    settings: { getSettings: () => ({}) },
    events: { emit }
  } as unknown as ProjectCommandRuleServiceOptions;
  return { service: new ProjectCommandRuleService(options), files, emit };
}

describe("workspace rule materialization", () => {
  it("should generate only the selected file and scope every restart event to that workspace", async () => {
    const { service, files, emit } = createService();
    const result = await service.applyRules("project", false, "secondary");
    expect(result.applied).toBe(true);
    expect([...files.keys()]).toEqual(["/secondary/.codex/rules/opencodex-ui.rules"]);
    await service.restartRules("project", "secondary");
    expect(emit).toHaveBeenCalledTimes(3);
    for (const [event] of emit.mock.calls) {
      expect(event).toMatchObject({ projectId: "project", workspacePath: "/secondary" });
    }
  });
});
