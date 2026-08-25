/**
 * Covers model capability normalization from Codex app-server responses.
 */
import { describe, expect, it } from "vitest";

import { readModels } from "../src/backend/shared/codexReaders";

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
