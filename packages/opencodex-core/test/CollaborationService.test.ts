import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createOpenCodexSqliteCacheRepository } from "@open-codex-ui/opencodex-cache";
import type {
  OpenCodexEvent,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { CollaborationService } from "../src/backend/collaboration/CollaborationService";
import type { RuntimeEventPort } from "../src/backend/runtime/runtimePorts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("CollaborationService", () => {
  it("should associate spawn settings with the child thread and agent path", async () => {
    const service = new CollaborationService({
      cacheRepository: null,
      events: createEventPort()
    });

    await service.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-1",
        turnId: "turn-1",
        item: {
          type: "function_call",
          namespace: "collaboration",
          name: "spawn_agent",
          call_id: "call-1",
          arguments: JSON.stringify({
            target: "/root/reviewer",
            model: "gpt-5.6-luna",
            reasoning_effort: "high"
          })
        }
      }
    }, "source-1");

    expect(service.getSpawnExecutionMetadata(
      "source-1",
      "child-1",
      "parent-1",
      "/root/reviewer"
    )).toEqual({
      model: "gpt-5.6-luna",
      reasoningEffort: "high"
    });

    await service.handleNotification({
      method: "item/completed",
      params: {
        threadId: "parent-1",
        turnId: "turn-1",
        item: {
          type: "subAgentActivity",
          id: "call-1",
          kind: "started",
          agentThreadId: "child-1",
          agentPath: "/root/reviewer"
        }
      }
    }, "source-1");

    expect(service.getSpawnExecutionMetadata(
      "source-1",
      "child-1",
      "parent-1",
      "/root/reviewer"
    )).toEqual({
      model: "gpt-5.6-luna",
      reasoningEffort: "high"
    });
  });

  it("should merge out-of-order live spawn evidence and restore its prompt", async () => {
    const repository = createRepository();
    const emittedEvents: OpenCodexEvent[] = [];
    const service = new CollaborationService({
      cacheRepository: repository,
      events: createEventPort((event) => emittedEvents.push(event))
    });

    await service.handleNotification({
      method: "item/started",
      params: {
        threadId: "parent-1",
        turnId: "turn-1",
        item: {
          type: "subAgentActivity",
          id: "call-1",
          kind: "started",
          agentThreadId: "child-1",
          agentPath: "/root/reviewer"
        }
      }
    }, "source-1");
    await service.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-1",
        turnId: "turn-1",
        item: {
          type: "function_call",
          namespace: "collaboration",
          name: "spawn_agent",
          call_id: "call-1",
          arguments: JSON.stringify({
            task_name: "review_auth",
            prompt: "Review the authentication flow.",
            target: "/root/reviewer",
            model: "gpt-5.6-luna",
            reasoning_effort: "high"
          })
        }
      }
    }, "source-1");
    await service.handleNotification({
      method: "item/completed",
      params: {
        threadId: "parent-1",
        turnId: "turn-1",
        item: {
          type: "subAgentActivity",
          id: "call-1",
          kind: "started",
          agentThreadId: "child-1",
          agentPath: "/root/reviewer"
        }
      }
    }, "source-1");

    const reconnectedService = new CollaborationService({
      cacheRepository: repository,
      events: createEventPort()
    });
    await expect(reconnectedService.resolveSpawnExecutionMetadata(
      "source-1",
      "child-1",
      "parent-1",
      "/root/reviewer"
    )).resolves.toEqual({
      model: "gpt-5.6-luna",
      reasoningEffort: "high"
    });
    const events = await reconnectedService.listEvents({
      sourceId: "source-1",
      threadId: "parent-1"
    });
    const liveEventIds = emittedEvents
      .filter((event) => event.type === "collaboration.updated")
      .map((event) => event.event.id);

    expect(new Set(liveEventIds).size).toBe(1);
    expect(events).toEqual([
      expect.objectContaining({
        action: "spawn",
        status: "completed",
        prompt: "Review the authentication flow.",
        receiverThreadIds: ["child-1"],
        receiverAgentPaths: ["/root/reviewer"],
        evidence: ["canonicalItem", "rawFunctionCall"]
      })
    ]);

    await repository.close();
  });

  it("should reconstruct canonical history without overwriting a live prompt", async () => {
    const repository = createRepository();
    const service = new CollaborationService({
      cacheRepository: repository,
      events: createEventPort()
    });

    await service.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "parent-1",
        turnId: "turn-1",
        item: {
          type: "function_call",
          namespace: "collaboration",
          name: "send_message",
          call_id: "call-2",
          arguments: JSON.stringify({
            target: "/root/reviewer",
            message: "Also verify Windows behavior."
          })
        }
      }
    }, "source-1");
    await service.reconcileTurns("source-1", "parent-1", [{
      id: "turn-1",
      items: [{
        type: "subAgentActivity",
        id: "call-2",
        kind: "interacted",
        agentThreadId: "child-1",
        agentPath: "/root/reviewer"
      }]
    }]);

    const events = await service.listEvents({ sourceId: "source-1", rootThreadId: "parent-1" });

    expect(events).toEqual([
      expect.objectContaining({
        action: "message",
        prompt: "Also verify Windows behavior.",
        receiverThreadIds: ["child-1"],
        status: "completed"
      })
    ]);

    await repository.close();
  });

  it("should create nested structural fallbacks when semantic history is unavailable", async () => {
    const repository = createRepository();
    const service = new CollaborationService({
      cacheRepository: repository,
      events: createEventPort()
    });
    const parent = createThread("parent-1", null, 0, "/root");
    const child = createThread("child-1", "parent-1", 1, "/root/reviewer");
    const grandchild = createThread("child-2", "child-1", 2, "/root/reviewer/tester");

    await repository.upsertThreadIndex([parent, child, grandchild]);
    await service.reconcileDescendantThreads(
      "source-1",
      "parent-1",
      [child, grandchild]
    );

    const events = await service.listEvents({
      sourceId: "source-1",
      rootThreadId: "parent-1"
    });
    const cachedThreads = await repository.listThreads({
      scope: "all",
      sourceId: "source-1"
    });

    expect(events).toHaveLength(2);
    expect(events.map((event) => event.receiverThreadIds[0])).toEqual(["child-1", "child-2"]);
    expect(events.every((event) => (
      event.prompt === null && event.evidence.includes("structuralInference")
    ))).toBe(true);
    expect(cachedThreads.find((thread) => thread.id === "child-2")?.subAgentSource).toMatchObject({
      depth: 2,
      agentPath: "/root/reviewer/tester"
    });
    expect(cachedThreads.find((thread) => thread.id === "child-2")?.canAcceptDirectInput).toBeNull();

    await service.handleNotification({
      method: "item/completed",
      params: {
        threadId: "parent-1",
        turnId: "turn-1",
        item: {
          type: "subAgentActivity",
          id: "call-child-1",
          kind: "started",
          agentThreadId: "child-1",
          agentPath: "/root/reviewer"
        }
      }
    }, "source-1");

    const enrichedEvents = await service.listEvents({
      sourceId: "source-1",
      rootThreadId: "parent-1"
    });

    expect(enrichedEvents).toHaveLength(2);
    expect(enrichedEvents.filter((event) => event.receiverThreadIds.includes("child-1")))
      .toEqual([expect.objectContaining({ evidence: ["canonicalItem"] })]);

    await repository.close();
  });

  it("should ignore unrelated notifications without emitting or persisting data", async () => {
    const repository = createRepository();
    const emittedEvents: OpenCodexEvent[] = [];
    const service = new CollaborationService({
      cacheRepository: repository,
      events: createEventPort((event) => emittedEvents.push(event))
    });

    await service.handleNotification({
      method: "unknown/futureNotification",
      params: { threadId: "parent-1", turnId: "turn-1", payload: true }
    }, "source-1");

    expect(emittedEvents).toEqual([]);
    expect(await service.listEvents({ sourceId: "source-1" })).toEqual([]);

    await repository.close();
  });
});

/** Creates an isolated SQLite cache repository for one test. */
function createRepository() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-collaboration-core-"));
  temporaryDirectories.push(directory);
  return createOpenCodexSqliteCacheRepository({ directory });
}

/** Creates the event port required by the collaboration service tests. */
function createEventPort(emit: (event: OpenCodexEvent) => void = () => undefined): RuntimeEventPort {
  return {
    emit,
    recordRawNotification: () => undefined,
    recordClientRequest: () => undefined,
    readThreadEventLog: () => ({ entries: [], truncated: false })
  };
}

/** Creates source-aware thread metadata with a structured spawn origin. */
function createThread(
  id: string,
  parentThreadId: string | null,
  depth: number,
  agentPath: string
): OpenCodexThread {
  return {
    id,
    sessionId: "session-1",
    parentThreadId,
    codexTitle: id,
    customTitle: null,
    title: id,
    preview: "",
    model: "gpt-5.6-luna",
    reasoningEffort: "medium",
    projectName: "project",
    projectPath: "/tmp/project",
    sourceId: "source-1",
    branchName: null,
    updatedAt: "2026-08-08T00:00:00.000Z",
    isArchived: false,
    threadSource: null,
    agentNickname: parentThreadId === null ? null : id,
    agentRole: parentThreadId === null ? null : "worker",
    subAgentSource: parentThreadId === null ? null : {
      kind: "threadSpawn",
      parentThreadId,
      depth,
      agentPath,
      agentNickname: id,
      agentRole: "worker",
      label: null
    },
    canAcceptDirectInput: parentThreadId === null ? true : false,
    status: "idle"
  };
}
