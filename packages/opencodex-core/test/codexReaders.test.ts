/**
 * Covers model capability normalization from Codex app-server responses.
 */
import { describe, expect, it } from "vitest";

import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";

import { readModels, readThreadPages } from "../src/backend/shared/codexReaders";

describe("Codex model readers", () => {
  it("should preserve model-specific reasoning efforts and defaults", () => {
    const models = readModels({
      data: [
        {
          id: "gpt-5.6-terra",
          displayName: "GPT-5.6 Terra",
          defaultReasoningEffort: "medium",
          supportedReasoningEfforts: [
            { reasoningEffort: "low", description: "Fast" },
            { reasoningEffort: "max", description: "Maximum" },
            { reasoningEffort: "max", description: "Duplicate" }
          ],
          serviceTiers: []
        }
      ]
    });

    expect(models[0]).toMatchObject({
      id: "gpt-5.6-terra",
      defaultReasoningEffort: "medium",
      supportedReasoningEfforts: [
        { reasoningEffort: "low", description: "Fast" },
        { reasoningEffort: "max", description: "Maximum" }
      ]
    });
  });

  it("should accept future reasoning effort identifiers", () => {
    const models = readModels({
      data: [
        {
          model: "future-model",
          supportedReasoningLevels: [
            { effort: "experimental", description: "Future level" }
          ]
        }
      ]
    });

    expect(models[0]?.supportedReasoningEfforts).toEqual([
      { reasoningEffort: "experimental", description: "Future level" }
    ]);
  });
});

describe("Codex thread readers", () => {
  it("should deduplicate threads repeated across paginated responses", async () => {
    const responses: unknown[] = [
      {
        data: [
          { id: "thread-1", name: "First" },
          { id: "thread-2", name: "Second" }
        ],
        nextCursor: "next"
      },
      {
        data: [
          { id: "thread-1", name: "First again" },
          { id: "thread-3", name: "Third" }
        ],
        nextCursor: null
      }
    ];
    const client = {
      listThreads: async () => responses.shift() ?? { data: [] }
    } as CodexAppServerClient;

    const threads = await readThreadPages(client, { limit: 100 });

    expect(threads.map((thread) => thread.id)).toEqual([
      "thread-1",
      "thread-2",
      "thread-3"
    ]);
    expect(threads[0]?.codexTitle).toBe("First");
  });
});
