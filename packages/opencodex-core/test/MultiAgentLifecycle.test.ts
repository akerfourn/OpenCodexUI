import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import {
  createOpenCodexSqliteCacheRepository,
  type OpenCodexCacheRepository
} from "@open-codex-ui/opencodex-cache";
import type { OpenCodexEvent } from "@open-codex-ui/opencodex-protocol";

import { CollaborationService } from "../src/backend/CollaborationService";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("multi-agent lifecycle integration", () => {
  it("should expose live V2 spawn and follow-up communication once", async () => {
    const repository = createRepository();
    const emittedEvents: OpenCodexEvent[] = [];
    const service = createService(repository, emittedEvents);

    await service.handleNotification(createRawFunctionCall(
      "parent-1",
      "turn-1",
      "call-spawn",
      "spawn_agent",
      {
        target: "/root/reviewer",
        message: "Review the authentication flow.",
        task_name: "review_auth",
        model: "gpt-5.6-luna"
      }
    ), "source-1");
    await service.handleNotification(createActivity(
      "parent-1",
      "turn-1",
      "call-spawn",
      "started",
      "child-1",
      "/root/reviewer"
    ), "source-1");
    await service.handleNotification(createRawFunctionCall(
      "parent-1",
      "turn-1",
      "call-followup",
      "followup_task",
      {
        target: "/root/reviewer",
        message: "Also verify the Windows behavior."
      }
    ), "source-1");
    await service.handleNotification(createActivity(
      "parent-1",
      "turn-1",
      "call-followup",
      "interacted",
      "child-1",
      "/root/reviewer"
    ), "source-1");

    const events = await service.listEvents({
      sourceId: "source-1",
      threadId: "parent-1"
    });
    const emittedCollaborationEvents = emittedEvents.filter((event) => (
      event.type === "collaboration.updated"
    ));

    expect(events).toMatchObject([
      {
        action: "spawn",
        prompt: "Review the authentication flow.",
        receiverThreadIds: ["child-1"]
      },
      {
        action: "followup",
        prompt: "Also verify the Windows behavior.",
        receiverThreadIds: ["child-1"]
      }
    ]);
    expect(new Set(emittedCollaborationEvents.map((event) => event.event.id)).size).toBe(2);

    await repository.close();
  });

  it("should preserve raw prompts across restart and canonical-only resume", async () => {
    const directory = createTemporaryDirectory();
    const initialRepository = createRepository(directory);
    const initialService = createService(initialRepository);

    await initialService.handleNotification(createRawFunctionCall(
      "parent-1",
      "turn-1",
      "call-message",
      "send_message",
      {
        target: "/root/reviewer",
        message: "Retain this instruction after restart."
      }
    ), "source-1");
    await initialRepository.close();

    const reopenedRepository = createRepository(directory);
    const resumedService = createService(reopenedRepository);

    await resumedService.reconcileTurns("source-1", "parent-1", [{
      id: "turn-1",
      items: [{
        type: "subAgentActivity",
        id: "call-message",
        kind: "interacted",
        agentThreadId: "child-1",
        agentPath: "/root/reviewer"
      }]
    }]);

    const events = await resumedService.listEvents({
      sourceId: "source-1",
      threadId: "parent-1"
    });

    expect(events).toEqual([expect.objectContaining({
      action: "message",
      prompt: "Retain this instruction after restart.",
      receiverThreadIds: ["child-1"],
      evidence: ["rawFunctionCall", "canonicalItem"]
    })]);

    await reopenedRepository.close();
  });

  it("should persist V1 canonical and V2 raw events independently", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await service.handleNotification({
      method: "item/completed",
      params: {
        threadId: "parent-1",
        turnId: "turn-v1",
        item: {
          type: "collabAgentToolCall",
          id: "call-v1",
          tool: "spawnAgent",
          status: "completed",
          senderThreadId: "parent-1",
          receiverThreadIds: ["child-v1"],
          prompt: "Canonical delegation.",
          model: "gpt-5.6-luna",
          reasoningEffort: "medium",
          agentsStates: {}
        }
      }
    }, "source-1");
    await service.handleNotification(createRawFunctionCall(
      "parent-1",
      "turn-v2",
      "call-v2",
      "spawn_agent",
      {
        target: "/root/raw_worker",
        message: "Raw V2 delegation.",
        model: "gpt-5.6-luna"
      }
    ), "source-1");

    const events = await service.listEvents({ sourceId: "source-1" });

    expect(events).toEqual([
      expect.objectContaining({
        callId: "call-v1",
        prompt: "Canonical delegation.",
        evidence: ["canonicalItem"]
      }),
      expect.objectContaining({
        callId: "call-v2",
        prompt: "Raw V2 delegation.",
        evidence: ["rawFunctionCall"]
      })
    ]);

    await repository.close();
  });

  it("should preserve a nested V2 coordinator with a Luna leaf result", async () => {
    const repository = createRepository();
    const service = createService(repository);

    await recordV2Spawn(service, {
      sourceId: "source-1",
      senderThreadId: "root-thread",
      turnId: "turn-root",
      callId: "call-coordinator",
      childThreadId: "coordinator-thread",
      childPath: "/root/coordinator",
      model: "gpt-5.6-sol"
    });
    await recordV2Spawn(service, {
      sourceId: "source-1",
      senderThreadId: "coordinator-thread",
      turnId: "turn-coordinator",
      callId: "call-leaf",
      childThreadId: "leaf-thread",
      childPath: "/root/coordinator/leaf",
      model: "gpt-5.6-luna"
    });
    await service.handleNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "coordinator-thread",
        turnId: "turn-coordinator",
        item: {
          type: "agent_message",
          id: "leaf-result",
          author: "/root/coordinator/leaf",
          recipient: "/root/coordinator",
          content: [{
            type: "input_text",
            text: [
              "Message Type: FINAL_ANSWER",
              "Task name: leaf",
              "Sender: /root/coordinator/leaf",
              "Payload:",
              "The leaf verification completed successfully."
            ].join("\n")
          }]
        }
      }
    }, "source-1");

    const events = await service.listEvents({ sourceId: "source-1" });
    const spawnEvents = events.filter((event) => event.action === "spawn");
    const resultEvent = events.find((event) => event.action === "result");

    expect(spawnEvents).toMatchObject([
      {
        senderThreadId: "root-thread",
        receiverThreadIds: ["coordinator-thread"],
        model: "gpt-5.6-sol"
      },
      {
        senderThreadId: "coordinator-thread",
        receiverThreadIds: ["leaf-thread"],
        model: "gpt-5.6-luna"
      }
    ]);
    expect(resultEvent).toMatchObject({
      senderAgentPath: "/root/coordinator/leaf",
      receiverAgentPaths: ["/root/coordinator"],
      result: "The leaf verification completed successfully."
    });
    expect(events.some((event) => event.threadId === "leaf-thread")).toBe(false);

    await repository.close();
  });
});

type V2SpawnFixture = {
  sourceId: string;
  senderThreadId: string;
  turnId: string;
  callId: string;
  childThreadId: string;
  childPath: string;
  model: string;
};

/** Records the raw and canonical halves of one V2 spawn. */
async function recordV2Spawn(
  service: CollaborationService,
  fixture: V2SpawnFixture
): Promise<void> {
  await service.handleNotification(createRawFunctionCall(
    fixture.senderThreadId,
    fixture.turnId,
    fixture.callId,
    "spawn_agent",
    {
      target: fixture.childPath,
      message: `Delegate to ${fixture.childPath}.`,
      task_name: fixture.childThreadId,
      model: fixture.model
    }
  ), fixture.sourceId);
  await service.handleNotification(createActivity(
    fixture.senderThreadId,
    fixture.turnId,
    fixture.callId,
    "started",
    fixture.childThreadId,
    fixture.childPath
  ), fixture.sourceId);
}

/** Creates a raw V2 collaboration function call notification. */
function createRawFunctionCall(
  threadId: string,
  turnId: string,
  callId: string,
  name: string,
  args: Record<string, unknown>
): CodexNotification {
  return {
    method: "rawResponseItem/completed",
    params: {
      threadId,
      turnId,
      item: {
        type: "function_call",
        namespace: "collaboration",
        name,
        call_id: callId,
        arguments: JSON.stringify(args)
      }
    }
  };
}

/** Creates a completed V2 sub-agent activity notification. */
function createActivity(
  threadId: string,
  turnId: string,
  callId: string,
  kind: "started" | "interacted" | "interrupted",
  childThreadId: string,
  childPath: string
): CodexNotification {
  return {
    method: "item/completed",
    params: {
      threadId,
      turnId,
      item: {
        type: "subAgentActivity",
        id: callId,
        kind,
        agentThreadId: childThreadId,
        agentPath: childPath
      }
    }
  };
}

/** Creates an isolated SQLite repository, optionally reopening an existing path. */
function createRepository(directory = createTemporaryDirectory()): OpenCodexCacheRepository {
  return createOpenCodexSqliteCacheRepository({ directory });
}

/** Allocates one cache path retained until the current test completes. */
function createTemporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "opencodex-multi-agent-"));
  temporaryDirectories.push(directory);
  return directory;
}

/** Creates a collaboration service with optional live event collection. */
function createService(
  cacheRepository: OpenCodexCacheRepository,
  emittedEvents: OpenCodexEvent[] = []
): CollaborationService {
  return new CollaborationService({
    cacheRepository,
    emit: (event) => emittedEvents.push(event)
  });
}
