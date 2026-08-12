import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createClientProject,
  resolveProjectOpenSourceId
} from "../src/stores/projectMapping";

describe("project mapping helpers", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("should create deterministic source-aware client project metadata", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-02T03:04:05.000Z"));

    expect(createClientProject("/workspace/project-a", null, "source-a")).toEqual({
      id: "client:source-a:/workspace/project-a",
      sourceId: "source-a",
      path: "/workspace/project-a",
      defaultName: "project-a",
      displayName: null,
      isHidden: false,
      preferences: {},
      createdAt: "2026-01-02T03:04:05.000Z",
      updatedAt: "2026-01-02T03:04:05.000Z",
      lastSeenAt: "2026-01-02T03:04:05.000Z",
      editedAt: "2026-01-02T03:04:05.000Z"
    });
  });

  it("should preserve explicit names and normalize an empty orphan path", () => {
    const project = createClientProject("  ", "Imported project", null);

    expect(project).toMatchObject({
      id: "client:orphan:unknown",
      sourceId: null,
      path: "unknown",
      defaultName: "Imported project"
    });
  });

  it("should derive project names from Windows paths", () => {
    expect(createClientProject("C:\\workspace\\project-a", null, "source-a").defaultName)
      .toBe("project-a");
  });

  it("should resolve project-open sources in selection priority order", () => {
    expect(resolveProjectOpenSourceId("selected", "default", "first")).toBe("selected");
    expect(resolveProjectOpenSourceId(null, "default", "first")).toBe("default");
    expect(resolveProjectOpenSourceId(null, null, "first")).toBe("first");
    expect(resolveProjectOpenSourceId(null, null, undefined)).toBeNull();
  });
});
