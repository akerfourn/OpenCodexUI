/**
 * Covers mapping helpers that normalize Codex payloads for the UI.
 */
import { describe, expect, it } from "vitest";

import { createApprovalRequest, mapThread, mapThreadMessages, mapTurnsToMessages } from "../src/mapping";

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
              content: [{ type: "text", text: "Hello" }]
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
      { id: "user-1", threadId: "thread-1", role: "user", content: "Hello" },
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
});
