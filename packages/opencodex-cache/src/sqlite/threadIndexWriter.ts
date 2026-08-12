/**
 * Writes thread index rows and their associated projects.
 */
import type { Database as BetterSqliteDatabase } from "better-sqlite3";

import { createProjectIdentity } from "../projectIdentity.js";
import type { CachedThreadSummary } from "../types.js";
import { ensureProjectTreeItem } from "./projectGroupQueries.js";

/**
 * Writes thread index data and associated project rows.
 *
 * @param database SQLite database connection.
 * @param threads Thread summaries to write.
 *
 * @returns Nothing.
 */
export function writeThreadIndex(
  database: BetterSqliteDatabase,
  threads: CachedThreadSummary[]
): void {
  const now = new Date().toISOString();
  const upsertProject = database.prepare(
    `
    INSERT INTO projects (
      id,
      source_id,
      source_key,
      path,
      default_name,
      display_name,
      is_hidden,
      created_at,
      updated_at,
      last_seen_at
    )
    VALUES (
      @id,
      @sourceId,
      @sourceKey,
      @path,
      @defaultName,
      NULL,
      @isHidden,
      @now,
      @now,
      @now
    )
    ON CONFLICT(source_key, path) DO UPDATE SET
      source_id = COALESCE(excluded.source_id, projects.source_id),
      default_name = excluded.default_name,
      is_hidden = CASE
        WHEN excluded.is_hidden = 1 THEN 1
        ELSE projects.is_hidden
      END,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at
    `
  );
  const upsertThread = database.prepare(
    `
    INSERT INTO threads (
      id,
      session_id,
      parent_thread_id,
      source_id,
      project_id,
      cwd,
      branch_name,
      codex_title,
      custom_title,
      title,
      preview,
      model,
      reasoning_effort,
      status,
      is_archived,
      thread_source,
      agent_nickname,
      agent_role,
      sub_agent_source_json,
      updated_at
    )
    VALUES (
      @id,
      @sessionId,
      @parentThreadId,
      @sourceId,
      @projectId,
      @cwd,
      @branchName,
      @codexTitle,
      @customTitle,
      @title,
      @preview,
      @model,
      @reasoningEffort,
      @status,
      @isArchived,
      @threadSource,
      @agentNickname,
      @agentRole,
      @subAgentSourceJson,
      @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      session_id = COALESCE(excluded.session_id, threads.session_id),
      parent_thread_id = COALESCE(excluded.parent_thread_id, threads.parent_thread_id),
      source_id = COALESCE(excluded.source_id, threads.source_id),
      project_id = excluded.project_id,
      cwd = excluded.cwd,
      branch_name = excluded.branch_name,
      codex_title = excluded.codex_title,
      custom_title = COALESCE(excluded.custom_title, threads.custom_title),
      title = CASE
        WHEN COALESCE(excluded.custom_title, threads.custom_title, '') <> ''
          THEN COALESCE(excluded.custom_title, threads.custom_title)
        WHEN excluded.codex_title <> '' THEN excluded.codex_title
        ELSE COALESCE(excluded.preview, '')
      END,
      preview = excluded.preview,
      model = COALESCE(excluded.model, threads.model),
      reasoning_effort = COALESCE(excluded.reasoning_effort, threads.reasoning_effort),
      status = excluded.status,
      is_archived = excluded.is_archived,
      thread_source = excluded.thread_source,
      agent_nickname = excluded.agent_nickname,
      agent_role = excluded.agent_role,
      sub_agent_source_json = COALESCE(
        excluded.sub_agent_source_json,
        threads.sub_agent_source_json
      ),
      updated_at = CASE
        WHEN excluded.updated_at IS NULL THEN threads.updated_at
        WHEN threads.updated_at IS NULL OR excluded.updated_at > threads.updated_at
          THEN excluded.updated_at
        ELSE threads.updated_at
      END
    `
  );

  const writeIndex = database.transaction(() => {
    for (const thread of threads) {
      const sourceId = thread.sourceId;
      const project = createProjectIdentity(thread.projectPath ?? "", sourceId);

      if (project !== null) {
        upsertProject.run({
          ...project,
          sourceId,
          isHidden: thread.projectHidden === true ? 1 : 0,
          now
        });
        ensureProjectTreeItem(database, project.id);
      }

      upsertThread.run({
        id: thread.id,
        sessionId: thread.sessionId,
        parentThreadId: thread.parentThreadId,
        sourceId,
        projectId: project?.id ?? null,
        cwd: project?.path ?? null,
        branchName: thread.branchName ?? null,
        codexTitle: thread.codexTitle,
        customTitle: thread.customTitle,
        title: thread.title,
        preview: thread.preview ?? null,
        model: thread.model ?? null,
        reasoningEffort: thread.reasoningEffort ?? null,
        status: thread.status ?? null,
        isArchived: thread.isArchived ? 1 : 0,
        threadSource: thread.threadSource,
        agentNickname: thread.agentNickname,
        agentRole: thread.agentRole,
        subAgentSourceJson: thread.subAgentSource === null
          ? null
          : JSON.stringify(thread.subAgentSource),
        updatedAt: thread.updatedAt ?? null
      });
    }
  });

  writeIndex();
}
