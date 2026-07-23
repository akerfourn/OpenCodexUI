/**
 * OpenCodexUI-only project group and mixed tree operations.
 */
import crypto from "node:crypto";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import type {
  CachedProjectGroup,
  CachedProjectGroupCreateInput,
  CachedProjectGroupsSnapshot,
  CachedProjectGroupUpdateInput
} from "../types.js";
import { mapProjectGroupRow, mapProjectTreeItemRow } from "./mappers.js";
import type { ProjectGroupRow, ProjectTreeItemRow } from "./rowTypes.js";

/**
 * Lists groups and mixed group/project tree items in their persisted order.
 *
 * @param database SQLite database connection.
 * @returns Complete project tree snapshot.
 */
export async function listProjectGroups(
  database: BetterSqliteDatabase
): Promise<CachedProjectGroupsSnapshot> {
  const groups = database
    .prepare(
      `
      SELECT id, name, is_collapsed, created_at, updated_at
      FROM project_groups
      ORDER BY created_at ASC, id ASC
      `
    )
    .all() as ProjectGroupRow[];
  const items = database
    .prepare(
      `
      SELECT item_type, group_id, project_id, parent_group_id, sort_order
      FROM project_tree_items
      ORDER BY parent_group_id IS NOT NULL, parent_group_id, sort_order, item_type
      `
    )
    .all() as ProjectTreeItemRow[];

  return {
    groups: groups.map((row) => mapProjectGroupRow(row)),
    items: items.map((row) => mapProjectTreeItemRow(row))
  };
}

/**
 * Creates a group and appends it to the requested sibling list.
 *
 * @param database SQLite database connection.
 * @param input Group name and optional parent group.
 * @returns Created group.
 */
export async function createProjectGroup(
  database: BetterSqliteDatabase,
  input: CachedProjectGroupCreateInput
): Promise<CachedProjectGroup> {
  const name = normalizeGroupName(input.name);
  const parentGroupId = input.parentGroupId ?? null;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const create = database.transaction(() => {
    assertGroupExists(database, parentGroupId);
    database
      .prepare(
        `
        INSERT INTO project_groups (id, name, is_collapsed, created_at, updated_at)
        VALUES (@id, @name, 0, @now, @now)
        `
      )
      .run({ id, name, now });
    insertTreeItem(database, "group", id, parentGroupId, readNextSortOrder(database, parentGroupId));
  });

  create();
  return readProjectGroup(database, id);
}

/**
 * Updates a group name and/or collapsed state.
 *
 * @param database SQLite database connection.
 * @param groupId Group identifier.
 * @param patch Fields to update.
 * @returns Updated group.
 */
export async function updateProjectGroup(
  database: BetterSqliteDatabase,
  groupId: string,
  patch: CachedProjectGroupUpdateInput
): Promise<CachedProjectGroup> {
  const current = readProjectGroup(database, groupId);
  const name = patch.name === undefined ? current.name : normalizeGroupName(patch.name);
  const isCollapsed = patch.isCollapsed === undefined ? current.isCollapsed : patch.isCollapsed;

  database
    .prepare(
      `
      UPDATE project_groups
      SET name = @name, is_collapsed = @isCollapsed, updated_at = @updatedAt
      WHERE id = @groupId
      `
    )
    .run({
      groupId,
      name,
      isCollapsed: isCollapsed ? 1 : 0,
      updatedAt: new Date().toISOString()
    });

  return readProjectGroup(database, groupId);
}

/**
 * Deletes a group while promoting its direct children to its previous parent.
 *
 * @param database SQLite database connection.
 * @param groupId Group identifier.
 * @returns Promise resolved after the group is deleted.
 */
export async function deleteProjectGroup(
  database: BetterSqliteDatabase,
  groupId: string
): Promise<void> {
  const remove = database.transaction(() => {
    readProjectGroup(database, groupId);
    const parent = database
      .prepare(
        `
        SELECT parent_group_id
        FROM project_tree_items
        WHERE item_type = 'group' AND group_id = @groupId
        `
      )
      .get({ groupId }) as { parent_group_id: string | null } | undefined;
    const parentGroupId = parent?.parent_group_id ?? null;

    database
      .prepare(
        `
        UPDATE project_tree_items
        SET parent_group_id = @parentGroupId
        WHERE parent_group_id = @groupId
        `
      )
      .run({ groupId, parentGroupId });
    database.prepare("DELETE FROM project_groups WHERE id = ?").run(groupId);
  });

  remove();
}

/**
 * Assigns a project to a group or to the root project list.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @param groupId Destination group, or null for the root.
 * @returns Promise resolved after the project is moved.
 */
export async function assignProjectToGroup(
  database: BetterSqliteDatabase,
  projectId: string,
  groupId: string | null
): Promise<void> {
  const move = database.transaction(() => {
    const project = database.prepare("SELECT id FROM projects WHERE id = ?").get(projectId);
    if (project === undefined) {
      throw new Error("Project does not exist.");
    }
    assertGroupExists(database, groupId);
    ensureProjectTreeItem(database, projectId);
    database
      .prepare(
        `
        UPDATE project_tree_items
        SET parent_group_id = @groupId, sort_order = @sortOrder
        WHERE item_type = 'project' AND project_id = @projectId
        `
      )
      .run({
        projectId,
        groupId,
        sortOrder: readNextSortOrder(database, groupId)
      });
  });

  move();
}

/**
 * Ensures every cached project has a root tree item.
 *
 * @param database SQLite database connection.
 * @param projectId Project identifier.
 * @returns Nothing.
 */
export function ensureProjectTreeItem(
  database: BetterSqliteDatabase,
  projectId: string
): void {
  database
    .prepare(
      `
      INSERT INTO project_tree_items (item_type, project_id, parent_group_id, sort_order)
      SELECT 'project', @projectId, NULL,
        COALESCE((SELECT MAX(sort_order) + 1 FROM project_tree_items WHERE parent_group_id IS NULL), 0)
      WHERE NOT EXISTS (
        SELECT 1 FROM project_tree_items WHERE item_type = 'project' AND project_id = @projectId
      )
      `
    )
    .run({ projectId });
}

/** Reads one project group or raises a clear not-found error. */
function readProjectGroup(
  database: BetterSqliteDatabase,
  groupId: string
): CachedProjectGroup {
  const row = database
    .prepare(
      `
      SELECT id, name, is_collapsed, created_at, updated_at
      FROM project_groups
      WHERE id = ?
      `
    )
    .get(groupId) as ProjectGroupRow | undefined;

  if (row === undefined) {
    throw new Error("Project group does not exist.");
  }

  return mapProjectGroupRow(row);
}

/** Validates an optional parent group identifier. */
function assertGroupExists(
  database: BetterSqliteDatabase,
  groupId: string | null
): void {
  if (groupId === null) {
    return;
  }

  readProjectGroup(database, groupId);
}

/** Returns the next append position for one sibling list. */
function readNextSortOrder(
  database: BetterSqliteDatabase,
  parentGroupId: string | null
): number {
  const row = database
    .prepare(
      `
      SELECT COALESCE(MAX(sort_order) + 1, 0) AS next_sort_order
      FROM project_tree_items
      WHERE parent_group_id IS @parentGroupId
      `
    )
    .get({ parentGroupId }) as { next_sort_order: number };

  return row.next_sort_order;
}

/** Inserts a group or project tree item at a known position. */
function insertTreeItem(
  database: BetterSqliteDatabase,
  type: "group" | "project",
  id: string,
  parentGroupId: string | null,
  sortOrder: number
): void {
  if (type === "group") {
    database
      .prepare(
        `
        INSERT INTO project_tree_items (item_type, group_id, parent_group_id, sort_order)
        VALUES ('group', @id, @parentGroupId, @sortOrder)
        `
      )
      .run({ id, parentGroupId, sortOrder });
    return;
  }

  database
    .prepare(
      `
      INSERT INTO project_tree_items (item_type, project_id, parent_group_id, sort_order)
      VALUES ('project', @id, @parentGroupId, @sortOrder)
      `
    )
    .run({ id, parentGroupId, sortOrder });
}

/** Normalizes and validates a user-entered group name. */
function normalizeGroupName(name: string): string {
  const normalized = name.trim();
  if (normalized.length === 0) {
    throw new Error("Project group name is required.");
  }

  return normalized;
}
