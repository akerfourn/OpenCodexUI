/** Covers source-aware hierarchy listing, fallback, and discovery behavior. */
import { describe, expect, it } from "vitest";

import {
  createHierarchyThread,
  createThreadHierarchyFixture
} from "./fixtures/threadHierarchyFixture";
import {
  THREAD_LIST_PAGE_SIZE,
  THREAD_SUB_AGENT_SOURCE_KINDS
} from "../src/backend/shared/constants";

describe("ThreadConversationService hierarchy operations", () => {
  it("should list two online pages with source-aware cache and reconciliation ordering", async () => {
    const fixture = createThreadHierarchyFixture({
      listResponses: [
        {
          data: [createRawThread("child-1", "parent-1", 1)],
          nextCursor: "cursor-page-2"
        },
        {
          data: [createRawThread("grandchild-1", "child-1", 2)],
          nextCursor: null
        }
      ]
    });

    const threads = await fixture.service.listSubAgentThreads("parent-1", "source-online");

    expect(fixture.readThreadsArgs).toEqual([
      ["all", null, "source-online", undefined, false],
      ["all", null, "source-online", undefined, true]
    ]);
    expect(fixture.client.listThreadParams).toEqual([
      {
        limit: THREAD_LIST_PAGE_SIZE,
        sortKey: "updated_at",
        sortDirection: "desc",
        sourceKinds: THREAD_SUB_AGENT_SOURCE_KINDS,
        ancestorThreadId: "parent-1"
      },
      {
        limit: THREAD_LIST_PAGE_SIZE,
        sortKey: "updated_at",
        sortDirection: "desc",
        sourceKinds: THREAD_SUB_AGENT_SOURCE_KINDS,
        ancestorThreadId: "parent-1",
        cursor: "cursor-page-2"
      }
    ]);
    expect(threads.map((thread) => [thread.id, thread.sourceId])).toEqual([
      ["child-1", "source-online"],
      ["grandchild-1", "source-online"]
    ]);
    expect(fixture.reconciledDescendants).toEqual([{
      sourceId: "source-online",
      parentThreadId: "parent-1",
      threads
    }]);
    expect(fixture.calls.indexOf("writeIndex")).toBeGreaterThan(-1);
    expect(fixture.calls.indexOf("reconcileDescendantThreads")).toBeGreaterThan(-1);
    expect(fixture.calls.indexOf("writeIndex"))
      .toBeLessThan(fixture.calls.indexOf("reconcileDescendantThreads"));
  });

  it("should return cached descendants when the online list fails", async () => {
    const child = createHierarchyThread({
      id: "cached-child",
      parentThreadId: "parent-1"
    });
    const fixture = createThreadHierarchyFixture({
      activeThreads: [child],
      listError: new Error("Codex unavailable")
    });

    await expect(fixture.service.listSubAgentThreads("parent-1", "source-online"))
      .resolves.toEqual([child]);

    expect(fixture.indexedThreads).toEqual([]);
    expect(fixture.reconciledDescendants).toEqual([]);
  });

  it("should rethrow the online error when no cached descendant exists", async () => {
    const error = new Error("Codex unavailable");
    const fixture = createThreadHierarchyFixture({ listError: error });

    await expect(fixture.service.listSubAgentThreads("parent-1", "source-online"))
      .rejects.toBe(error);

    expect(fixture.indexedThreads).toEqual([]);
    expect(fixture.reconciledDescendants).toEqual([]);
  });

  it("should read orphan active and archived descendants without a client", async () => {
    const activeChild = createHierarchyThread({
      id: "child-1",
      sourceId: null,
      parentThreadId: "parent-1"
    });
    const archivedDuplicate = createHierarchyThread({
      id: "child-1",
      sourceId: null,
      parentThreadId: "parent-1",
      isArchived: true,
      title: "Archived child"
    });
    const archivedGrandchild = createHierarchyThread({
      id: "grandchild-1",
      sourceId: null,
      parentThreadId: "child-1",
      isArchived: true
    });
    const unrelated = createHierarchyThread({
      id: "unrelated",
      sourceId: null,
      parentThreadId: "other-root",
      isArchived: true
    });
    const fixture = createThreadHierarchyFixture({
      activeThreads: [activeChild],
      archivedThreads: [archivedDuplicate, archivedGrandchild, unrelated]
    });

    const descendants = await fixture.service.listSubAgentThreads("parent-1", null);

    expect(fixture.readThreadsArgs).toEqual([
      ["all", null, null, undefined, false],
      ["all", null, null, undefined, true]
    ]);
    expect(descendants.map((thread) => thread.id)).toEqual(["child-1", "grandchild-1"]);
    expect(descendants[0]).toEqual(archivedDuplicate);
    expect(fixture.calls).not.toContain("ensureClient");
    expect(fixture.calls).not.toContain("rpc:listThreads");
  });

  it("should record complete started metadata and ignore invalid notifications", async () => {
    const fixture = createThreadHierarchyFixture();

    await fixture.service.recordStartedThread(createRawThread("started-child", "parent-1", 3), "source-1");
    await fixture.service.recordStartedThread({
      id: "compact-thread",
      source: { subagent: "compact" }
    }, "source-1");
    await fixture.service.recordStartedThread({
      id: "missing-parent",
      source: { subagent: { thread_spawn: {} } }
    }, "source-1");
    await fixture.service.recordStartedThread({
      id: "",
      parentThreadId: "parent-1"
    }, "source-1");

    const discovered = fixture.events.filter((event) => event.type === "thread.discovered");
    const startedThread = fixture.threadTurnCache.get("started-child")?.thread;

    expect(startedThread).toMatchObject({
      id: "started-child",
      parentThreadId: "parent-1",
      sourceId: "source-1",
      agentNickname: "Luna",
      agentRole: "reviewer",
      subAgentSource: {
        kind: "threadSpawn",
        parentThreadId: "parent-1",
        depth: 3,
        agentPath: "/root/reviewer",
        agentNickname: "Luna",
        agentRole: "reviewer"
      }
    });
    expect(discovered).toHaveLength(1);
    expect(fixture.events.some((event) => event.type === "thread.created")).toBe(false);
    expect(fixture.indexedThreads).toHaveLength(1);
    expect(fixture.calls.indexOf("event:thread.discovered"))
      .toBeLessThan(fixture.calls.indexOf("writeIndex"));
  });
});

/** Builds the raw thread shape returned by Codex list and started notifications. */
function createRawThread(id: string, parentThreadId: string, depth: number): Record<string, unknown> {
  return {
    id,
    cwd: "/workspace/project",
    name: id,
    preview: `Preview for ${id}`,
    parentThreadId,
    threadSource: "subAgentThreadSpawn",
    source: {
      subagent: {
        thread_spawn: {
          parent_thread_id: parentThreadId,
          depth,
          agent_path: "/root/reviewer",
          agent_nickname: "Luna",
          agent_role: "reviewer"
        }
      }
    },
    canAcceptDirectInput: false,
    status: { type: "active" }
  };
}
