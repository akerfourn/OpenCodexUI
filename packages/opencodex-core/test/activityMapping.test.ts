/** Covers activity and reasoning mapping from Codex payloads. */
import { describe, expect, it } from "vitest";

import {
  createActivityFromNotification,
  mapTurnsToOpenCodexTurns
} from "../src/mapping";
import { readReasoningDeltaText, readReasoningSegments } from "../src/mapping/activitySummary";

describe("activity mapping", () => {
  it("should map command execution output notifications to activities", () => {
    expect(
      createActivityFromNotification({
        method: "item/commandExecution/outputDelta",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          itemId: "command-1",
          delta: "npm run typecheck"
        }
      })
    ).toMatchObject({
      id: "command-1",
      threadId: "thread-1",
      kind: "commandExecution",
      title: "turn-1",
      content: "npm run typecheck",
      status: "running"
    });
  });

  it("should preserve structured plan snapshots alongside legacy text", () => {
    const activity = createActivityFromNotification({
      method: "turn/plan/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        explanation: "Préparer la correction",
        plan: [
          { step: "Analyser le code", status: "completed" },
          { step: "Adapter le rendu", status: "inProgress" },
          { step: "Ajouter les tests", status: "pending" }
        ]
      }
    });

    expect(activity).toMatchObject({
      id: "plan-turn-1",
      kind: "plan",
      content: expect.stringContaining("Préparer la correction"),
      plan: {
        explanation: "Préparer la correction",
        steps: [
          { step: "Analyser le code", status: "completed" },
          { step: "Adapter le rendu", status: "inProgress" },
          { step: "Ajouter les tests", status: "pending" }
        ]
      }
    });
  });

  it("should keep historical text-only plans on the generic activity path", () => {
    const turns = mapTurnsToOpenCodexTurns("thread-1", [
      {
        id: "turn-1",
        status: "completed",
        items: [
          {
            type: "plan",
            id: "legacy-plan-1",
            text: "completed: Analyser\npending: Implémenter"
          }
        ]
      }
    ]);

    expect(turns[0]?.items[0]).toMatchObject({
      id: "legacy-plan-1",
      kind: "plan",
      content: "completed: Analyser\npending: Implémenter",
      plan: null
    });
  });

  it("should keep turn diff notifications compact and stable", () => {
    const activity = createActivityFromNotification({
      method: "turn/diff/updated",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        diff: [
          "diff --git a/src/a.ts b/src/a.ts",
          "index 1111111..2222222 100644",
          "--- a/src/a.ts",
          "+++ b/src/a.ts",
          "@@ -1 +1 @@",
          "-old",
          "+new"
        ].join("\n")
      }
    });

    expect(activity).toMatchObject({
      id: "diff-turn-1",
      threadId: "thread-1",
      kind: "fileChange",
      title: "turn-1",
      content: "Diff mis à jour: 1 fichier modifié",
      details: expect.stringContaining("diff --git a/src/a.ts b/src/a.ts")
    });
  });

  it("should map structured command execution items to activities", () => {
    expect(
      createActivityFromNotification({
        method: "item/started",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            type: "commandExecution",
            id: "command-1",
            command: "npm run typecheck",
            cwd: "/workspace",
            processId: null,
            source: "model",
            status: "running",
            commandActions: [],
            aggregatedOutput: null,
            exitCode: null,
            durationMs: null
          }
        }
      })
    ).toMatchObject({
      id: "command-1",
      threadId: "thread-1",
      kind: "commandExecution",
      title: "turn-1",
      content: "Commande: npm run typecheck",
      status: "running"
    });
  });

  it("should map raw local shell items to command activities", () => {
    expect(
      createActivityFromNotification({
        method: "rawResponseItem/completed",
        params: {
          threadId: "thread-1",
          turnId: "turn-1",
          item: {
            type: "local_shell_call",
            call_id: "call-1",
            status: "completed",
            action: {
              type: "exec",
              command: ["npm", "run", "typecheck"],
              timeout_ms: null,
              working_directory: "/workspace",
              env: null,
              user: null
            }
          }
        }
      })
    ).toMatchObject({
      id: "call-1",
      threadId: "thread-1",
      kind: "commandExecution",
      title: "turn-1",
      content: "npm run typecheck",
      status: "completed"
    });
  });

  it.each([
    ["spawn_agent", ""],
    ["future_agent_action", "collaboration"]
  ])("should identify raw collaboration function %s as sub-agent activity", (
    functionName,
    namespace
  ) => {
    const activity = createActivityFromNotification({
      method: "rawResponseItem/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          type: "function_call",
          namespace,
          name: functionName,
          call_id: `call-${functionName}`,
          arguments: "{}"
        }
      }
    });

    expect(activity).toMatchObject({
      id: `call-${functionName}`,
      kind: "subAgentActivity"
    });
  });

  it("should label canonical V2 activity as sub-agent work when semantic data is missing", () => {
    const activity = createActivityFromNotification({
      method: "item/completed",
      params: {
        threadId: "thread-1",
        turnId: "turn-1",
        item: {
          type: "subAgentActivity",
          id: "call-1",
          kind: "interacted",
          agentThreadId: "child-1",
          agentPath: "/root/child"
        }
      }
    });

    expect(activity).toMatchObject({
      id: "call-1",
      kind: "subAgentActivity",
      status: "completed"
    });
    expect(activity?.content).toContain("interacted");
  });

});

describe("reasoning mapping", () => {
  it("should ignore serialized empty reasoning deltas", () => {
    const delta = JSON.stringify({
      type: "reasoning",
      id: "reasoning-1",
      summary: [],
      content: []
    });

    expect(readReasoningDeltaText(delta)).toBe("");
  });

  it("should read nested reasoning segments", () => {
    const segments = readReasoningSegments([
      {
        type: "reasoning",
        id: "reasoning-1",
        summary: [{ text: "Analyse" }],
        content: []
      }
    ]);

    expect(segments).toEqual(["Analyse"]);
  });
});
