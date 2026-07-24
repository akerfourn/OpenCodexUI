import Fuse from "fuse.js";

import type {
  OpenCodexProject,
  OpenCodexProjectGroup,
  OpenCodexProjectTreeItem
} from "@open-codex-ui/opencodex-protocol";

export type HomeProjectTreeNode =
  | {
      type: "group";
      group: OpenCodexProjectGroup;
      editedAt: string;
      depth: number;
      childCount: number;
      parentGroupId: string | null;
    }
  | {
      type: "project";
      project: OpenCodexProject;
      depth: number;
      groupId: string | null;
    };

export type HomeProjectTreeBranch = {
  node: HomeProjectTreeNode;
  children: HomeProjectTreeBranch[];
};

type NormalizedTreeItem = {
  item: OpenCodexProjectTreeItem;
  id: string;
};

type TreeBuildResult = {
  nodes: HomeProjectTreeNode[];
  hasVisible: boolean;
};

type BuildContext = {
  groupsById: Map<string, OpenCodexProjectGroup>;
  projectsById: Map<string, OpenCodexProject>;
  childrenByParent: Map<string, NormalizedTreeItem[]>;
  matchingGroupIds: Set<string>;
  matchingProjectIds: Set<string>;
  groupEditedAtById: Map<string, string>;
  isSearchActive: boolean;
  visitedGroups: Set<string>;
};

/**
 * Builds a flattened, searchable rendering tree from the persisted project tree.
 *
 * @param projects Projects already filtered by visibility and source.
 * @param groups Persisted project groups.
 * @param items Persisted mixed group/project tree items.
 * @param searchTerm Project or group search text.
 * @returns Visible nodes in display order.
 */
export function buildHomeProjectTree(options: {
  projects: OpenCodexProject[];
  groups: OpenCodexProjectGroup[];
  items: OpenCodexProjectTreeItem[];
  searchTerm: string;
}): HomeProjectTreeNode[] {
  const normalizedSearchTerm = options.searchTerm.trim();
  const matchingProjectIds = findMatchingProjectIds(options.projects, normalizedSearchTerm);
  const matchingGroupIds = findMatchingGroupIds(options.groups, normalizedSearchTerm);
  const groupsById = new Map(options.groups.map((group) => [group.id, group]));
  const projectsById = new Map(options.projects.map((project) => [project.id, project]));
  const childrenByParent = normalizeTreeItems(
    options.projects,
    options.groups,
    options.items,
    groupsById,
    projectsById
  );
  const groupEditedAtById = new Map<string, string>();
  for (const group of options.groups) {
    readGroupEditedAt(
      group.id,
      groupsById,
      projectsById,
      childrenByParent,
      groupEditedAtById,
      new Set()
    );
  }
  const context: BuildContext = {
    groupsById,
    projectsById,
    childrenByParent,
    matchingGroupIds,
    matchingProjectIds,
    groupEditedAtById,
    isSearchActive: normalizedSearchTerm.length > 0,
    visitedGroups: new Set()
  };

  return buildLevel(context, null, 0, false).nodes;
}

/**
 * Rebuilds nested branches from the flattened rendering tree.
 *
 * @param nodes Flattened nodes ordered for display.
 * @returns Nested branches suitable for grouped rendering.
 */
export function nestHomeProjectTreeNodes(nodes: HomeProjectTreeNode[]): HomeProjectTreeBranch[] {
  const rootBranches: HomeProjectTreeBranch[] = [];
  const groupStack: Array<{
    depth: number;
    children: HomeProjectTreeBranch[];
  }> = [];

  for (const node of nodes) {
    while (
      groupStack.length > 0
      && groupStack[groupStack.length - 1]!.depth >= node.depth
    ) {
      groupStack.pop();
    }

    const siblings = groupStack[groupStack.length - 1]?.children ?? rootBranches;
    const branch: HomeProjectTreeBranch = { node, children: [] };
    siblings.push(branch);

    if (node.type === "group") {
      groupStack.push({ depth: node.depth, children: branch.children });
    }
  }

  return rootBranches;
}

/** Finds fuzzy project matches while keeping source/visibility filtering external. */
function findMatchingProjectIds(
  projects: OpenCodexProject[],
  searchTerm: string
): Set<string> {
  if (searchTerm.length === 0) {
    return new Set();
  }

  const fuse = new Fuse(projects, {
    keys: [
      { name: "displayName", weight: 0.45 },
      { name: "defaultName", weight: 0.45 },
      { name: "path", weight: 0.2 }
    ],
    threshold: 0.38
  });

  return new Set(fuse.search(searchTerm).map((result) => result.item.id));
}

/** Finds fuzzy group-name matches. */
function findMatchingGroupIds(
  groups: OpenCodexProjectGroup[],
  searchTerm: string
): Set<string> {
  if (searchTerm.length === 0) {
    return new Set();
  }

  const fuse = new Fuse(groups, { keys: ["name"], threshold: 0.38 });
  return new Set(fuse.search(searchTerm).map((result) => result.item.id));
}

/** Normalizes persisted items and supplies root entries for newly discovered projects. */
function normalizeTreeItems(
  projects: OpenCodexProject[],
  groups: OpenCodexProjectGroup[],
  items: OpenCodexProjectTreeItem[],
  groupsById: Map<string, OpenCodexProjectGroup>,
  projectsById: Map<string, OpenCodexProject>
): Map<string, NormalizedTreeItem[]> {
  const childrenByParent = new Map<string, NormalizedTreeItem[]>();
  const itemKeys = new Set<string>();
  const validGroupIds = new Set(groups.map((group) => group.id));

  for (const item of items) {
    const id = item.type === "group" ? item.groupId : item.projectId;
    const key = `${item.type}:${id}`;
    const isValid = item.type === "group"
      ? groupsById.has(item.groupId)
      : projectsById.has(item.projectId);
    const parentGroupId = item.parentGroupId !== null && validGroupIds.has(item.parentGroupId)
      ? item.parentGroupId
      : null;

    if (!isValid || itemKeys.has(key)) {
      continue;
    }

    itemKeys.add(key);
    appendTreeItem(childrenByParent, parentGroupId, { item, id });
  }

  const rootItems = childrenByParent.get(rootKey(null)) ?? [];
  let nextSortOrder = rootItems.reduce(
    (maximum, entry) => Math.max(maximum, entry.item.sortOrder),
    -1
  ) + 1;

  for (const project of projects) {
    const key = `project:${project.id}`;
    if (itemKeys.has(key)) {
      continue;
    }

    appendTreeItem(childrenByParent, null, {
      id: project.id,
      item: {
        type: "project",
        projectId: project.id,
        parentGroupId: null,
        sortOrder: nextSortOrder
      }
    });
    itemKeys.add(key);
    nextSortOrder += 1;
  }

  for (const group of groups) {
    const key = `group:${group.id}`;
    if (itemKeys.has(key)) {
      continue;
    }

    appendTreeItem(childrenByParent, null, {
      id: group.id,
      item: {
        type: "group",
        groupId: group.id,
        parentGroupId: null,
        sortOrder: nextSortOrder
      }
    });
    itemKeys.add(key);
    nextSortOrder += 1;
  }

  return childrenByParent;
}

/** Appends and sorts a normalized item in one sibling list. */
function appendTreeItem(
  childrenByParent: Map<string, NormalizedTreeItem[]>,
  parentGroupId: string | null,
  item: NormalizedTreeItem
): void {
  const key = rootKey(parentGroupId);
  const children = childrenByParent.get(key) ?? [];
  children.push(item);
  childrenByParent.set(key, children);
}

/** Recursively builds one visible level and its expanded descendants. */
function buildLevel(
  context: BuildContext,
  parentGroupId: string | null,
  depth: number,
  forceShow: boolean
): TreeBuildResult {
  const children = [
    ...(context.childrenByParent.get(rootKey(parentGroupId)) ?? [])
  ].sort((left, right) => compareTreeItemsByActivity(context, left, right));
  const nodes: HomeProjectTreeNode[] = [];
  let hasVisible = false;

  for (const entry of children) {
    if (entry.item.type === "project") {
      const project = context.projectsById.get(entry.item.projectId);
      if (project === undefined) {
        continue;
      }

      const isVisible = !context.isSearchActive
        || forceShow
        || context.matchingProjectIds.has(project.id);
      if (!isVisible) {
        continue;
      }

      hasVisible = true;
      nodes.push({
        type: "project",
        project,
        depth,
        groupId: parentGroupId
      });
      continue;
    }

    const group = context.groupsById.get(entry.item.groupId);
    if (group === undefined || context.visitedGroups.has(group.id)) {
      continue;
    }

    context.visitedGroups.add(group.id);
    const groupMatches = context.matchingGroupIds.has(group.id);
    const childResult = buildLevel(
      context,
      group.id,
      depth + 1,
      forceShow || groupMatches
    );
    context.visitedGroups.delete(group.id);

    const isVisible = !context.isSearchActive || forceShow || groupMatches || childResult.hasVisible;
    if (!isVisible) {
      continue;
    }

    hasVisible = true;
    nodes.push({
      type: "group",
      group,
      editedAt: context.groupEditedAtById.get(group.id) ?? group.createdAt,
      depth,
      childCount: (context.childrenByParent.get(rootKey(group.id)) ?? []).length,
      parentGroupId
    });

    const shouldExpand = context.isSearchActive || !group.isCollapsed || groupMatches || forceShow;
    if (shouldExpand) {
      nodes.push(...childResult.nodes);
    }
  }

  return { nodes, hasVisible };
}

/** Sorts groups and projects by their latest project activity. */
function compareTreeItemsByActivity(
  context: BuildContext,
  left: NormalizedTreeItem,
  right: NormalizedTreeItem
): number {
  const leftActivity = readTreeItemActivity(context, left);
  const rightActivity = readTreeItemActivity(context, right);
  const activityDifference = readTimestamp(rightActivity) - readTimestamp(leftActivity);

  return activityDifference !== 0
    ? activityDifference
    : left.id.localeCompare(right.id);
}

/** Returns the activity date used to order one project or group. */
function readTreeItemActivity(context: BuildContext, item: NormalizedTreeItem): string {
  if (item.item.type === "project") {
    return context.projectsById.get(item.item.projectId)?.editedAt ?? "";
  }

  return context.groupEditedAtById.get(item.item.groupId)
    ?? context.groupsById.get(item.item.groupId)?.createdAt
    ?? "";
}

/** Calculates a group's latest descendant project activity recursively. */
function readGroupEditedAt(
  groupId: string,
  groupsById: Map<string, OpenCodexProjectGroup>,
  projectsById: Map<string, OpenCodexProject>,
  childrenByParent: Map<string, NormalizedTreeItem[]>,
  editedAtById: Map<string, string>,
  visitingGroupIds: Set<string>
): string {
  const cachedEditedAt = editedAtById.get(groupId);
  if (cachedEditedAt !== undefined) {
    return cachedEditedAt;
  }

  const group = groupsById.get(groupId);
  if (group === undefined || visitingGroupIds.has(groupId)) {
    return group?.createdAt ?? "";
  }

  visitingGroupIds.add(groupId);
  let editedAt = group.createdAt;
  const children = childrenByParent.get(rootKey(groupId)) ?? [];

  for (const child of children) {
    const childEditedAt = child.item.type === "project"
      ? projectsById.get(child.item.projectId)?.editedAt ?? ""
      : readGroupEditedAt(
        child.item.groupId,
        groupsById,
        projectsById,
        childrenByParent,
        editedAtById,
        visitingGroupIds
      );
    editedAt = chooseLatestTimestamp(editedAt, childEditedAt);
  }

  visitingGroupIds.delete(groupId);
  editedAtById.set(groupId, editedAt);
  return editedAt;
}

/** Chooses the latest valid ISO-like timestamp while keeping a safe fallback. */
function chooseLatestTimestamp(current: string, candidate: string): string {
  if (readTimestamp(candidate) > readTimestamp(current)) {
    return candidate;
  }

  return current;
}

/** Parses a timestamp for deterministic activity comparisons. */
function readTimestamp(value: string): number {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

/** Creates a stable map key for root and nested sibling lists. */
function rootKey(parentGroupId: string | null): string {
  return parentGroupId ?? "__root__";
}
