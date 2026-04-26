import { describe, expect, it } from "vitest";

import { createApprovalRequest, mapThread, mapThreadMessages } from "../src/mapping";

describe("OpenCodex mapping", () => {
  it("should map a Codex thread to an OpenCodex thread", () => {
    expect(
      mapThread({
        id: "thread-1",
        name: "Titre",
        preview: "Aperçu",
        cwd: "/tmp/project",
        updatedAt: 1,
        status: "idle",
        gitInfo: { branch: "main" }
      })
    ).toEqual({
      id: "thread-1",
      title: "Titre",
      preview: "Aperçu",
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
              content: [{ type: "text", text: "Bonjour" }]
            },
            {
              type: "agentMessage",
              id: "assistant-1",
              text: "Salut"
            }
          ]
        }
      ]
    });

    expect(messages).toMatchObject([
      { id: "user-1", threadId: "thread-1", role: "user", content: "Bonjour" },
      { id: "assistant-1", threadId: "thread-1", role: "assistant", content: "Salut" }
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
          availableDecisions: ["accept", "decline"]
        }
      })
    ).toMatchObject({
      id: "1",
      threadId: "thread-1",
      kind: "command",
      choices: ["accept", "decline"]
    });
  });
});
