/** Characterizes thread catalog RPC, cache, and event ordering. */
import type {
  OpenCodexEvent,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import { THREAD_MAIN_SOURCE_KINDS } from "../src/backend/constants";
import {
  CatalogCodexClient,
  createFixture,
  createSnapshot,
  createThread
} from "./fixtures/threadCatalogFixture";

describe("ThreadConversationService catalog", () => {
  it("lists online threads cache-first with canonical source and stable event order", async () => {
    const cachedThread = createThread({
      id: "thread-cached",
      sourceId: "source-canonical",
      customTitle: "Local title",
      title: "Local title",
      isArchived: true
    });
    const client = new CatalogCodexClient({
      listResponses: [{
        data: [{
          id: "thread-cached",
          cwd: "/workspace/project",
          name: "Codex title",
          preview: "Preview",
          threadSource: "appServer"
        }]
      }]
    });
    const fixture = createFixture({
      client,
      cachedThreads: [cachedThread],
      resolvedSourceId: "source-canonical"
    });

    const threads = await fixture.service.listThreads(
      "currentProject",
      "/workspace/project",
      "source-requested",
      "  find me  ",
      true
    );

    expect(client.listThreadParams).toEqual([{
      limit: 100,
      sortKey: "updated_at",
      sortDirection: "desc",
      sourceKinds: THREAD_MAIN_SOURCE_KINDS,
      archived: true,
      searchTerm: "find me",
      cwd: "/workspace/project"
    }]);
    expect(fixture.ensureSourceIds).toEqual(["source-canonical"]);
    expect(fixture.deleteEmptyUnsyncedArgs).toEqual([
      ["/workspace/project", "source-requested"]
    ]);
    expect(fixture.readThreadsArgs).toEqual([
      ["currentProject", "/workspace/project", "source-requested", "  find me  ", true],
      ["currentProject", "/workspace/project", "source-canonical", "  find me  ", true]
    ]);
    expect(fixture.indexedThreads).toEqual([
      expect.objectContaining({
        id: "thread-cached",
        sourceId: "source-canonical",
        isArchived: true
      })
    ]);
    expect(threads).toEqual([expect.objectContaining({
      id: "thread-cached",
      sourceId: "source-canonical",
      customTitle: "Local title"
    })]);
    expect(fixture.calls).toEqual([
      "deleteEmptyUnsyncedThreads",
      "readThreads",
      "event:threads.updated",
      "resolveSource",
      "ensureClient",
      "rpc:listThreads",
      "writeIndex",
      "readThreads",
      "event:threads.updated",
      "readCachedProjects",
      "event:projects.updated"
    ]);
  });

  it("returns orphan cache data without resolving a source or starting Codex", async () => {
    const cachedThread = createThread({ sourceId: null });
    const fixture = createFixture({ cachedThreads: [cachedThread] });

    await expect(fixture.service.listThreads("all", null, null)).resolves.toEqual([cachedThread]);

    expect(fixture.calls).toEqual([
      "readThreads",
      "event:threads.updated"
    ]);
    expect(fixture.readThreadsArgs).toEqual([["all", null, null, undefined, false]]);
    expect(fixture.events[0]).toEqual({
      type: "threads.updated",
      threads: [cachedThread],
      currentProjectFilterAvailable: false,
      projectPath: null,
      archived: false
    });
    expect(fixture.ensureSourceIds).toEqual([]);
    expect(fixture.indexedThreads).toEqual([]);
  });

  it("creates an explicit thread with the historical cache and event order", async () => {
    const client = new CatalogCodexClient({
      startResponse: {
        thread: {
          id: "thread-created",
          cwd: "/workspace/project",
          name: "Created",
          preview: ""
        },
        model: "model-from-response",
        reasoningEffort: "high"
      }
    });
    const fixture = createFixture({ client, resolvedSourceId: "source-canonical" });

    const result = await fixture.service.createThread(
      "/workspace/project",
      "source-requested"
    );

    expect(client.startThreadParams).toEqual({
      cwd: "/workspace/project",
      model: "model-default"
    });
    expect(fixture.ensureSourceIds).toEqual(["source-canonical"]);
    expect(fixture.cachedProjectArgs).toEqual([["/workspace/project", "source-canonical"]]);
    expect(fixture.events).toContainEqual({
      type: "thread.created",
      thread: expect.objectContaining({
        id: "thread-created",
        sourceId: "source-canonical"
      }),
      turns: []
    });
    expect(result).toEqual({
      thread: expect.objectContaining({
        id: "thread-created",
        sourceId: "source-canonical",
        model: "model-from-response",
        reasoningEffort: "high"
      }),
      turns: []
    });
    expect(fixture.calls).toEqual([
      "resolveSource",
      "ensureClient",
      "cacheProject",
      "rpc:startThread",
      "event:thread.created",
      "writeIndex"
    ]);

    const missingSourceFixture = createFixture();
    await expect(missingSourceFixture.service.createThread(null, null))
      .rejects.toThrow("Cannot create a thread for a project without a Codex source.");
    expect(missingSourceFixture.calls).toEqual([]);
  });

  it("archives and restores using the snapshot source and exact RPC/cache order", async () => {
    const fixture = createFixture({
      client: new CatalogCodexClient(),
      snapshot: createSnapshot(createThread({ sourceId: "source-snapshot" }))
    });

    await expect(fixture.service.archiveThread("thread-1")).resolves.toEqual({ ok: true });
    await expect(fixture.service.unarchiveThread("thread-1")).resolves.toEqual({ ok: true });

    expect(fixture.ensureSourceIds).toEqual(["source-snapshot", "source-snapshot"]);
    expect(fixture.client.archiveThreadIds).toEqual(["thread-1"]);
    expect(fixture.client.unarchiveThreadIds).toEqual(["thread-1"]);
    expect(fixture.archiveStateWrites).toEqual([
      ["thread-1", true],
      ["thread-1", false]
    ]);
    expect(fixture.calls).toEqual([
      "readSnapshot",
      "ensureClient",
      "rpc:archiveThread",
      "writeArchiveState",
      "readSnapshot",
      "ensureClient",
      "rpc:unarchiveThread",
      "writeArchiveState"
    ]);
  });

  it("deletes through Codex, then forgets cache before refresh and deletion event", async () => {
    const fixture = createFixture({
      client: new CatalogCodexClient(),
      snapshot: createSnapshot(createThread({ sourceId: "source-snapshot" })),
      cachedThreads: [createThread({ id: "thread-1", sourceId: "source-snapshot" })]
    });

    await expect(fixture.service.deleteThread("thread-1")).resolves.toEqual({ ok: true });

    expect(fixture.client.deleteThreadIds).toEqual(["thread-1"]);
    expect(fixture.calls).toEqual([
      "readSnapshot",
      "ensureClient",
      "rpc:deleteThread",
      "readSnapshot",
      "deleteThread",
      "readThreads",
      "event:threads.updated",
      "event:thread.deleted"
    ]);
    expect(fixture.events.at(-1)).toEqual({
      type: "thread.deleted",
      sourceId: "source-snapshot",
      threadId: "thread-1"
    });
    expect(fixture.readThreadsArgs).toEqual([
      ["currentProject", "/workspace/project", "source-snapshot", undefined, undefined]
    ]);

    fixture.calls.length = 0;
    fixture.events.length = 0;
    await fixture.service.forgetDeletedThread("thread-1", "source-live");

    expect(fixture.calls).toEqual([
      "readSnapshot",
      "deleteThread",
      "readThreads",
      "event:threads.updated",
      "event:thread.deleted"
    ]);
    expect(fixture.readThreadsArgs).toEqual([
      ["currentProject", "/workspace/project", "source-snapshot", undefined, undefined],
      ["currentProject", "/workspace/project", "source-snapshot", undefined, undefined]
    ]);
    expect(fixture.events.at(-1)).toEqual({
      type: "thread.deleted",
      sourceId: "source-live",
      threadId: "thread-1"
    });
  });

  it("renames after trimming, updates memory, emits, and ignores blank names", async () => {
    const thread = createThread();
    const fixture = createFixture({
      client: new CatalogCodexClient(),
      snapshot: createSnapshot(thread),
      seedThread: thread
    });

    await fixture.service.renameThread("thread-1", "  Renamed title  ");

    expect(fixture.client.renameCalls).toEqual([{
      threadId: "thread-1",
      name: "Renamed title"
    }]);
    expect(fixture.titleWrites).toEqual([["thread-1", "Renamed title"]]);
    expect(fixture.threadTurnCache.get("thread-1")?.thread).toEqual(
      expect.objectContaining({
        customTitle: "Renamed title",
        title: "Renamed title"
      })
    );
    expect(fixture.events).toContainEqual({
      type: "thread.renamed",
      sourceId: "source-1",
      threadId: "thread-1",
      name: "Renamed title"
    });
    expect(fixture.calls).toEqual([
      "readSnapshot",
      "ensureClient",
      "rpc:renameThread",
      "writeTitle",
      "event:thread.renamed"
    ]);

    fixture.calls.length = 0;
    fixture.events.length = 0;
    await fixture.service.renameThread("thread-1", "   ");
    expect(fixture.calls).toEqual([]);
    expect(fixture.events).toEqual([]);
  });
});
