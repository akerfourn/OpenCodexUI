/** Covers project goal catalogue persistence and archive semantics. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "../../src/SqliteOpenCodexCacheRepository";
import type { OpenCodexCacheRepository } from "../../src/types";

describe("project goal persistence", () => {
  let directory: string;
  let repository: OpenCodexCacheRepository;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-cache-"));
    repository = createOpenCodexSqliteCacheRepository({ directory });
  });

  afterEach(async () => {
    await repository.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("should persist drafts, assign generic names, and archive goals separately", async () => {
    const project = await repository.upsertProject("/tmp/goals-project");
    const firstGoal = await repository.createProjectGoal({
      projectId: project.id,
      name: "",
      objective: "  Prepare the release  ",
      tokenBudget: 20_000
    });
    const secondGoal = await repository.createProjectGoal({
      projectId: project.id,
      name: "Improve tests",
      objective: "Add the missing regression tests.",
      tokenBudget: null
    });

    expect(firstGoal).toMatchObject({
      projectId: project.id,
      name: "Goal 1",
      objective: "Prepare the release",
      tokenBudget: 20_000,
      status: "draft",
      isArchived: false,
      launchedAt: null
    });
    expect(secondGoal.name).toBe("Improve tests");

    const updatedGoal = await repository.updateProjectGoal(firstGoal.id, {
      name: "Release preparation",
      objective: "Prepare and verify the release.",
      tokenBudget: 25_000
    });
    expect(updatedGoal).toMatchObject({
      name: "Release preparation",
      objective: "Prepare and verify the release.",
      tokenBudget: 25_000
    });

    const archivedGoal = await repository.archiveProjectGoal(firstGoal.id);
    expect(archivedGoal).toMatchObject({
      id: firstGoal.id,
      isArchived: true,
      archivedAt: expect.any(String)
    });
    expect((await repository.listProjectGoals(project.id)).map((goal) => goal.id))
      .not.toContain(firstGoal.id);

    await repository.close();
    repository = createOpenCodexSqliteCacheRepository({ directory });

    expect(await repository.listProjectGoals(project.id)).toMatchObject([
      { id: secondGoal.id, name: "Improve tests" }
    ]);
    expect(await repository.listProjectGoals(project.id, true)).toMatchObject([
      { id: firstGoal.id, name: "Release preparation", isArchived: true },
      { id: secondGoal.id, name: "Improve tests", isArchived: false }
    ]);

    const restoredGoal = await repository.unarchiveProjectGoal(firstGoal.id);
    expect(restoredGoal).toMatchObject({
      id: firstGoal.id,
      isArchived: false,
      archivedAt: null
    });
  });

  it("should reject empty objectives and retain drafts until explicitly deleted", async () => {
    const project = await repository.upsertProject("/tmp/draft-goals-project");

    await expect(repository.createProjectGoal({
      projectId: project.id,
      name: "Draft",
      objective: "   ",
      tokenBudget: null
    })).rejects.toThrow("Goal objective is required.");

    const draft = await repository.createProjectGoal({
      projectId: project.id,
      name: "Draft",
      objective: "Keep this draft until it is no longer useful.",
      tokenBudget: null
    });

    expect(await repository.listProjectGoals(project.id)).toHaveLength(1);
    await repository.deleteProjectGoal(draft.id);
    expect(await repository.listProjectGoals(project.id)).toHaveLength(0);
  });
});
