import { describe, expect, it } from "vitest";
import type { OpenCodexProjectCommandRulesSnapshot } from "@open-codex-ui/opencodex-protocol";
import { ProjectRulesStore } from "../src/stores/project/ProjectRulesStore";
import type { ProjectStore } from "../src/stores/project/ProjectStore";
import type { RootStore } from "../src/stores/RootStore";

describe("project rule workspace events", () => {
  it("should ignore another workspace while retaining legacy primary events", () => {
    const project = { project: { id: "project", path: "/primary" } } as unknown as ProjectStore;
    const store = new ProjectRulesStore(project, {} as RootStore);
    const snapshot = { rules: [], status: { filePath: "/secondary/.codex/rules" } } as OpenCodexProjectCommandRulesSnapshot;
    store.handleEvent({ type: "projectRules.updated", projectId: "project",
      workspacePath: "/secondary", snapshot });
    expect(store.status).toBeNull();
    store.handleEvent({ type: "projectRules.updated", projectId: "project", snapshot });
    expect(store.status).toEqual(snapshot.status);
  });
});
