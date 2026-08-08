/**
 * Covers semantic normalization of Codex V1 and V2 collaboration payloads.
 */
import { describe, expect, it } from "vitest";

import {
  correlateCollaborationEvents,
  normalizeCollaborationResponseItem,
  normalizeCollaborationThreadItem,
  type CollaborationNormalizationContext
} from "../src/mapping";

const parentContext: CollaborationNormalizationContext = {
  sourceId: "source-1",
  threadId: "thread-parent",
  turnId: "turn-parent"
};

describe("collaboration mapping", () => {
  it("should normalize a canonical V1 spawn with its receiver state", () => {
    const event = normalizeCollaborationThreadItem({
      type: "collabAgentToolCall",
      id: "call-spawn",
      tool: "spawnAgent",
      status: "completed",
      senderThreadId: "thread-parent",
      receiverThreadIds: ["thread-child"],
      prompt: "Inspect the authentication module.",
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
      agentsStates: {
        "thread-child": {
          status: "running",
          message: null
        }
      }
    }, parentContext);

    expect(event).toMatchObject({
      sourceId: "source-1",
      threadId: "thread-parent",
      turnId: "turn-parent",
      callId: "call-spawn",
      action: "spawn",
      toolName: "spawnAgent",
      senderThreadId: "thread-parent",
      receiverThreadIds: ["thread-child"],
      prompt: "Inspect the authentication module.",
      model: "gpt-5.6-luna",
      reasoningEffort: "high",
      status: "completed",
      targetAgentStatuses: {
        "thread-child": "running"
      },
      evidence: ["canonicalItem"]
    });
  });

  it("should correlate a V2 spawn function call with its activity marker", () => {
    const functionEvent = normalizeCollaborationResponseItem({
      type: "function_call",
      namespace: "collaboration",
      name: "spawn_agent",
      call_id: "call-v2-spawn",
      arguments: JSON.stringify({
        message: "Inspect the cache synchronization path.",
        task_name: "cache_audit",
        model: "gpt-5.6-luna",
        reasoning_effort: "medium",
        agent_type: "explorer",
        fork_turns: "5"
      })
    }, parentContext);
    const activityEvent = normalizeCollaborationThreadItem({
      type: "subAgentActivity",
      id: "call-v2-spawn",
      kind: "started",
      agentThreadId: "thread-child",
      agentPath: "/root/cache_audit"
    }, parentContext);

    expect(functionEvent).not.toBeNull();
    expect(activityEvent).not.toBeNull();

    const [event] = correlateCollaborationEvents([functionEvent!, activityEvent!]);

    expect(event).toMatchObject({
      action: "spawn",
      callId: "call-v2-spawn",
      senderThreadId: "thread-parent",
      receiverThreadIds: ["thread-child"],
      receiverAgentPaths: ["/root/cache_audit"],
      prompt: "Inspect the cache synchronization path.",
      taskName: "cache_audit",
      model: "gpt-5.6-luna",
      reasoningEffort: "medium",
      agentRole: "explorer",
      forkTurns: 5,
      status: "completed",
      evidence: ["rawFunctionCall", "canonicalItem"]
    });
  });

  it("should preserve the more precise follow-up action during correlation", () => {
    const activityEvent = normalizeCollaborationThreadItem({
      type: "subAgentActivity",
      id: "call-followup",
      kind: "interacted",
      agentThreadId: "thread-child",
      agentPath: "/root/cache_audit"
    }, parentContext, "started");
    const functionEvent = normalizeCollaborationResponseItem({
      type: "function_call",
      namespace: "collaboration",
      name: "followup_task",
      call_id: "call-followup",
      arguments: JSON.stringify({
        target: "/root/cache_audit",
        message: "Also check the Windows path handling."
      })
    }, parentContext);

    const [event] = correlateCollaborationEvents([activityEvent!, functionEvent!]);

    expect(event).toMatchObject({
      action: "followup",
      receiverThreadIds: ["thread-child"],
      receiverAgentPaths: ["/root/cache_audit"],
      prompt: "Also check the Windows path handling.",
      status: "pending",
      evidence: ["canonicalItem", "rawFunctionCall"]
    });
  });

  it("should distinguish queued messages from follow-up tasks", () => {
    const queuedMessage = normalizeCollaborationResponseItem({
      type: "function_call",
      namespace: "collaboration",
      name: "send_message",
      call_id: "call-message",
      arguments: JSON.stringify({
        target: "/root/worker",
        message: "Keep this constraint in mind."
      })
    }, parentContext);
    const followupTask = normalizeCollaborationResponseItem({
      type: "function_call",
      namespace: "collaboration",
      name: "followup_task",
      call_id: "call-task",
      arguments: JSON.stringify({
        target: "/root/worker",
        message: "Run another verification."
      })
    }, parentContext);

    expect(queuedMessage).toMatchObject({
      action: "message",
      prompt: "Keep this constraint in mind."
    });
    expect(followupTask).toMatchObject({
      action: "followup",
      prompt: "Run another verification."
    });
  });

  it("should expose the implicit full-history fork policy", () => {
    const event = normalizeCollaborationResponseItem({
      type: "function_call",
      namespace: "collaboration",
      name: "spawn_agent",
      call_id: "call-default-fork",
      arguments: JSON.stringify({
        message: "Inspect the entire conversation context.",
        task_name: "full_context"
      })
    }, parentContext);

    expect(event).toMatchObject({
      action: "spawn",
      forkTurns: "all"
    });
  });

  it("should keep nested interruption routing source-aware", () => {
    const nestedContext: CollaborationNormalizationContext = {
      sourceId: "source-remote",
      threadId: "thread-child",
      turnId: "turn-child"
    };
    const event = normalizeCollaborationResponseItem({
      type: "function_call",
      namespace: "collaboration",
      name: "interrupt_agent",
      call_id: "call-interrupt",
      arguments: JSON.stringify({ target: "/root/sibling" })
    }, nestedContext);

    expect(event).toMatchObject({
      sourceId: "source-remote",
      threadId: "thread-child",
      senderThreadId: "thread-child",
      action: "interrupt",
      receiverAgentPaths: ["/root/sibling"]
    });
  });

  it.each([
    ["sendInput", "message"],
    ["resumeAgent", "resume"],
    ["wait", "wait"],
    ["closeAgent", "close"]
  ] as const)("should normalize the canonical %s action", (tool, action) => {
    const event = normalizeCollaborationThreadItem({
      type: "collabAgentToolCall",
      id: `call-${tool}`,
      tool,
      status: "completed",
      senderThreadId: "thread-parent",
      receiverThreadIds: ["thread-child"],
      prompt: null,
      model: null,
      reasoningEffort: null,
      agentsStates: {}
    }, parentContext);

    expect(event?.action).toBe(action);
  });

  it("should extract a readable final result from an agent message", () => {
    const event = normalizeCollaborationResponseItem({
      type: "agent_message",
      id: "agent-message-result",
      author: "/root/cache_audit",
      recipient: "/root",
      content: [{
        type: "input_text",
        text: [
          "Message Type: FINAL_ANSWER",
          "Task name: cache_audit",
          "Sender: /root/cache_audit",
          "Payload:",
          "The cache race is caused by an outdated revision check."
        ].join("\n")
      }]
    }, parentContext);

    expect(event).toMatchObject({
      action: "result",
      senderAgentPath: "/root/cache_audit",
      receiverThreadIds: ["thread-parent"],
      receiverAgentPaths: ["/root"],
      prompt: null,
      result: "The cache race is caused by an outdated revision check.",
      taskName: "cache_audit",
      status: "completed",
      evidence: ["rawAgentMessage"]
    });
  });

  it("should extract a plaintext inter-agent message without making it a result", () => {
    const event = normalizeCollaborationResponseItem({
      type: "agent_message",
      id: "agent-message-followup",
      author: "/root",
      recipient: "/root/cache_audit",
      content: [{
        type: "input_text",
        text: [
          "Message Type: MESSAGE",
          "Task name: cache_audit",
          "Sender: /root",
          "Payload:",
          "Also inspect cache invalidation after resume."
        ].join("\n")
      }]
    }, {
      sourceId: "source-1",
      threadId: "thread-child",
      turnId: "turn-child"
    });

    expect(event).toMatchObject({
      action: "message",
      prompt: "Also inspect cache invalidation after resume.",
      result: null,
      taskName: "cache_audit"
    });
  });

  it("should retain routing but never expose encrypted message content", () => {
    const rawItem = {
      type: "agent_message",
      author: "/root",
      recipient: "/root/private_worker",
      content: [{
        type: "encrypted_content",
        encrypted_content: "opaque-secret-payload"
      }]
    };
    const firstEvent = normalizeCollaborationResponseItem(rawItem, parentContext);
    const secondEvent = normalizeCollaborationResponseItem(rawItem, parentContext);

    expect(firstEvent).toMatchObject({
      action: "message",
      senderAgentPath: "/root",
      receiverAgentPaths: ["/root/private_worker"],
      prompt: null,
      result: null
    });
    expect(firstEvent?.id).toBe(secondEvent?.id);
    expect(JSON.stringify(firstEvent)).not.toContain("opaque-secret-payload");
  });

  it("should merge started and completed lifecycle observations once", () => {
    const started = normalizeCollaborationThreadItem({
      type: "subAgentActivity",
      id: "call-lifecycle",
      kind: "started",
      agentThreadId: "thread-child",
      agentPath: "/root/child"
    }, parentContext, "started");
    const completed = normalizeCollaborationThreadItem({
      type: "subAgentActivity",
      id: "call-lifecycle",
      kind: "started",
      agentThreadId: "thread-child",
      agentPath: "/root/child"
    }, parentContext, "completed");

    const events = correlateCollaborationEvents([started!, completed!, started!]);

    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe("completed");
    expect(events[0]?.receiverThreadIds).toEqual(["thread-child"]);
  });

  it("should ignore unrelated tools, malformed items, and incomplete contexts", () => {
    expect(normalizeCollaborationResponseItem({
      type: "function_call",
      namespace: "mcp",
      name: "spawn_agent",
      call_id: "wrong-namespace",
      arguments: "{}"
    }, parentContext)).toBeNull();

    expect(normalizeCollaborationResponseItem({
      type: "function_call",
      namespace: "collaboration",
      name: "list_agents",
      call_id: "list-call",
      arguments: "{}"
    }, parentContext)).toBeNull();

    expect(normalizeCollaborationThreadItem({
      type: "subAgentActivity",
      id: "call-1",
      kind: "started",
      agentThreadId: "thread-child",
      agentPath: "/root/child"
    }, {
      sourceId: "",
      threadId: "thread-parent"
    })).toBeNull();
  });
});
