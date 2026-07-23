import { describe, expect, it } from "vitest";

import { buildHomeProjectTree } from "../src/components/home/homeProjectTree";

const firstProject = {
  id: "project-1",
  sourceId: "source-1",
  path: "/tmp/toto",
  defaultName: "toto",
  displayName: null,
  isHidden: false,
  preferences: {},
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lastSeenAt: "2026-01-01T00:00:00.000Z",
  editedAt: "2026-01-01T00:00:00.000Z"
};

const secondProject = {
  ...firstProject,
  id: "project-2",
  path: "/tmp/autre",
  defaultName: "autre"
};

describe("home project tree", () => {
  it("should show a matching project with all its logical group ancestors", () => {
    const nodes = buildHomeProjectTree({
      projects: [firstProject, secondProject],
      groups: [
        {
          id: "group-1",
          name: "tata",
          isCollapsed: true,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      items: [
        { type: "group", groupId: "group-1", parentGroupId: null, sortOrder: 0 },
        { type: "project", projectId: "project-1", parentGroupId: "group-1", sortOrder: 0 },
        { type: "project", projectId: "project-2", parentGroupId: null, sortOrder: 1 }
      ],
      searchTerm: "toto"
    });

    expect(nodes.map((node) => node.type === "group" ? node.group.name : node.project.defaultName))
      .toEqual(["tata", "toto"]);
    expect(nodes[0]).toMatchObject({ type: "group", depth: 0 });
    expect(nodes[1]).toMatchObject({ type: "project", depth: 1 });
  });

  it("should preserve mixed root ordering when no search is active", () => {
    const nodes = buildHomeProjectTree({
      projects: [firstProject],
      groups: [
        {
          id: "group-1",
          name: "Groupe",
          isCollapsed: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      items: [
        { type: "project", projectId: "project-1", parentGroupId: null, sortOrder: 1 },
        { type: "group", groupId: "group-1", parentGroupId: null, sortOrder: 0 }
      ],
      searchTerm: ""
    });

    expect(nodes.map((node) => node.type)).toEqual(["group", "project"]);
  });

  it("should order a group by the latest activity of its projects", () => {
    const nodes = buildHomeProjectTree({
      projects: [
        { ...firstProject, editedAt: "2026-01-01T00:00:00.000Z" },
        { ...secondProject, editedAt: "2026-03-01T00:00:00.000Z" }
      ],
      groups: [
        {
          id: "group-1",
          name: "Groupe actif",
          isCollapsed: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      items: [
        { type: "group", groupId: "group-1", parentGroupId: null, sortOrder: 1 },
        { type: "project", projectId: "project-1", parentGroupId: "group-1", sortOrder: 0 },
        { type: "project", projectId: "project-2", parentGroupId: null, sortOrder: 0 }
      ],
      searchTerm: ""
    });

    expect(nodes[0]).toMatchObject({ type: "project", project: { id: "project-2" } });
    expect(nodes[1]).toMatchObject({
      type: "group",
      group: { id: "group-1" },
      editedAt: "2026-01-01T00:00:00.000Z"
    });
  });
});
