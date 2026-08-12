/**
 * Covers mapping helpers that normalize Codex payloads for the UI.
 */
import { describe, expect, it } from "vitest";

import {
  mapThread,
  mapThreadMessages,
  mapTurnsToMessages,
  mapTurnsToOpenCodexTurns
} from "../src/mapping";

describe("OpenCodex mapping", () => {
  it("should expose optional execution metadata on a turn", () => {
    const turns = mapTurnsToOpenCodexTurns("thread-1", [
      {
        id: "turn-1",
        status: "completed",
        items: [],
        openCodexUiExecution: {
          requestedModel: "gpt-5.5",
          effectiveModel: "gpt-5.4",
          requestedReasoningEffort: "high",
          effectiveReasoningEffort: "high",
          serviceTier: "fast"
        }
      }
    ]);

    expect(turns[0]?.execution).toEqual({
      requestedModel: "gpt-5.5",
      effectiveModel: "gpt-5.4",
      requestedReasoningEffort: "high",
      effectiveReasoningEffort: "high",
      serviceTier: "fast"
    });
  });

  it("should preserve a turn error message when mapping completed turns", () => {
    const turns = mapTurnsToOpenCodexTurns("thread-1", [
      {
        id: "turn-1",
        status: "failed",
        error: {
          message: "Selected model is at capacity. Please try a different model."
        },
        items: []
      }
    ]);

    expect(turns[0]).toMatchObject({
      id: "turn-1",
      status: "failed",
      errorMessage: "Selected model is at capacity. Please try a different model."
    });
  });

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
      sessionId: null,
      parentThreadId: null,
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
      isArchived: false,
      threadSource: null,
      agentNickname: null,
      agentRole: null,
      subAgentSource: null,
      canAcceptDirectInput: null,
      status: "idle"
    });
  });

  it("should map structured sub-agent source metadata from Codex 0.147", () => {
    expect(mapThread({
      id: "child-1",
      parentThreadId: null,
      source: {
        subagent: {
          thread_spawn: {
            parent_thread_id: "parent-1",
            depth: 2,
            agent_path: "/root/reviewer",
            agent_nickname: "Luna",
            agent_role: "reviewer"
          }
        }
      },
      canAcceptDirectInput: true,
      status: { type: "active", activeFlags: [] }
    })).toMatchObject({
      id: "child-1",
      parentThreadId: "parent-1",
      agentNickname: "Luna",
      agentRole: "reviewer",
      canAcceptDirectInput: true,
      status: "active",
      subAgentSource: {
        kind: "threadSpawn",
        parentThreadId: "parent-1",
        depth: 2,
        agentPath: "/root/reviewer",
        agentNickname: "Luna",
        agentRole: "reviewer",
        label: null
      }
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

  it("should preserve steer user-message kind in mapped turns", () => {
    const turns = mapTurnsToOpenCodexTurns("thread-1", [
      {
        id: "turn-1",
        items: [
          {
            type: "userMessage",
            id: "steer-1",
            kind: "steer",
            content: [{ type: "text", text: "extra guidance" }]
          }
        ]
      }
    ]);

    expect(turns[0]?.items[0]).toMatchObject({
      id: "steer-1",
      role: "user",
      kind: "steer",
      content: "extra guidance"
    });
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

});
