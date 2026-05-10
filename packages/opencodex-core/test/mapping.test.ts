/**
 * Covers mapping helpers that normalize Codex payloads for the UI.
 */
import { describe, expect, it } from "vitest";

import {
  createActivityFromNotification,
  createApprovalRequest,
  mapThread,
  mapThreadMessages,
  mapTurnsToMessages,
  mapTurnsToOpenCodexTurns
} from "../src/mapping";

describe("OpenCodex mapping", () => {
  it("should map a Codex thread to an OpenCodex thread", () => {
    expect(
      mapThread({
        id: "thread-1",
        name: "Title",
        preview: "Preview",
        cwd: "/tmp/project",
        updatedAt: 1,
        status: "idle",
        gitInfo: { branch: "main" }
      })
    ).toEqual({
      id: "thread-1",
      codexTitle: "Title",
      customTitle: null,
      title: "Title",
      preview: "Preview",
      model: null,
      reasoningEffort: null,
      projectName: "project",
      projectPath: "/tmp/project",
      sourceId: null,
      branchName: "main",
      updatedAt: "1970-01-01T00:00:01.000Z",
      status: "idle"
    });
  });

  it("should map Codex turn items to OpenCodex messages", () => {
    const messages = mapThreadMessages({
      id: "thread-1",
      turns: [
        {
          id: "turn-1",
          items: [
            {
              type: "userMessage",
              id: "user-1",
              content: [
                { type: "text", text: "Hello" },
                { type: "image", url: "data:image/png;base64,abc" },
                { type: "localImage", path: "/tmp/screenshot.png" }
              ]
            },
            {
              type: "agentMessage",
              id: "assistant-1",
              text: "Hi"
            }
          ]
        }
      ]
    });

    expect(messages).toMatchObject([
      {
        id: "user-1",
        threadId: "thread-1",
        role: "user",
        content: "Hello",
        attachments: [
          { kind: "image", source: "dataUrl", value: "data:image/png;base64,abc" },
          { kind: "image", source: "localPath", value: "/tmp/screenshot.png", name: "screenshot.png" }
        ]
      },
      { id: "assistant-1", threadId: "thread-1", role: "assistant", content: "Hi" }
    ]);
  });

  it("should map paginated Codex turns to OpenCodex messages", () => {
    const messages = mapTurnsToMessages("thread-1", [
      {
        id: "turn-1",
        durationMs: 1500,
        items: [
          {
            type: "userMessage",
            id: "user-1",
            content: [{ type: "text", text: "Question" }]
          },
          {
            type: "agentMessage",
            id: "assistant-1",
            text: "Answer",
            phase: "final_answer"
          }
        ]
      }
    ]);

    expect(messages).toMatchObject([
      {
        id: "user-1",
        threadId: "thread-1",
        role: "user",
        content: "Question",
        turnId: "turn-1",
        turnDurationMs: 1500
      },
      {
        id: "assistant-1",
        threadId: "thread-1",
        role: "assistant",
        content: "Answer",
        turnId: "turn-1",
        turnDurationMs: 1500,
        phase: "final_answer"
      }
    ]);
  });

  it("should map reasoning summary strings to turn activities", () => {
    const turns = mapTurnsToOpenCodexTurns("thread-1", [
      {
        id: "turn-1",
        items: [
          {
            type: "reasoning",
            id: "reasoning-1",
            summary: ["Analyse du problème", "Choix de la solution"]
          }
        ]
      }
    ]);

    expect(turns[0]?.items[0]).toMatchObject({
      id: "reasoning-1",
      role: "activity",
      kind: "reasoning",
      content: "Analyse du problème\nChoix de la solution"
    });
  });

  it("should map reasoning object segments to turn activities", () => {
    const turns = mapTurnsToOpenCodexTurns("thread-1", [
      {
        id: "turn-1",
        items: [
          {
            type: "reasoning",
            id: "reasoning-1",
            summary: [
              { type: "summary_text", text: "Analyse du problème" },
              { type: "summary_text", text: "Choix de la solution" }
            ]
          }
        ]
      }
    ]);

    expect(turns[0]?.items[0]).toMatchObject({
      id: "reasoning-1",
      role: "activity",
      kind: "reasoning",
      content: "Analyse du problème\nChoix de la solution"
    });
  });

  it("should fall back to reasoning content when summary is empty", () => {
    const turns = mapTurnsToOpenCodexTurns("thread-1", [
      {
        id: "turn-1",
        items: [
          {
            type: "reasoning",
            id: "reasoning-1",
            summary: [],
            content: [
              { type: "reasoning_text", text: "Réflexion détaillée" },
              "Conclusion intermédiaire"
            ]
          }
        ]
      }
    ]);

    expect(turns[0]?.items[0]).toMatchObject({
      id: "reasoning-1",
      role: "activity",
      kind: "reasoning",
      content: "Réflexion détaillée\nConclusion intermédiaire"
    });
  });

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

  it("should map approval server requests", () => {
    expect(
      createApprovalRequest({
        id: 1,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          command: "npm test",
          cwd: "/workspace",
          reason: "Run the test suite",
          availableDecisions: ["accept"]
        }
      })
    ).toMatchObject({
      id: "1",
      threadId: "thread-1",
      kind: "command",
      command: "npm test",
      cwd: "/workspace",
      reason: "Run the test suite",
      choices: ["accept", "decline"]
    });
  });

  it("should preserve structured approval decisions", () => {
    expect(
      createApprovalRequest({
        id: 2,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          command: "mkdir -p /tmp/example",
          availableDecisions: [
            {
              acceptWithExecpolicyAmendment: {
                execpolicy_amendment: ["mkdir", "-p"]
              }
            },
            {
              applyNetworkPolicyAmendment: {
                network_policy_amendment: {
                  host: "registry.npmjs.org",
                  action: "allow"
                }
              }
            },
            "cancel"
          ]
        }
      }).choices
    ).toEqual([
      {
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: ["mkdir", "-p"]
        }
      },
      {
        applyNetworkPolicyAmendment: {
          network_policy_amendment: {
            host: "registry.npmjs.org",
            action: "allow"
          }
        }
      },
      "cancel",
      "decline"
    ]);
  });
});
