import { describe, expect, it } from "vitest";

import {
  DEFAULT_OPEN_CODEX_REASONING_EFFORTS,
  type OpenCodexModel,
  type OpenCodexModelServiceTier,
  type OpenCodexReasoningEffortOption
} from "@open-codex-ui/opencodex-protocol";

import {
  findModel,
  getCommitMessageModelOptions,
  getModelOptions,
  getReasoningEffortOptions,
  getServiceTierOptions,
  resolveReasoningEffort
} from "../src/stores/app/modelSelection";

const fastTier: OpenCodexModelServiceTier = {
  id: "fast",
  name: "Fast",
  description: "Lower latency"
};

const batchTier: OpenCodexModelServiceTier = {
  id: "batch",
  name: "Batch",
  description: "Lower cost"
};

/** Creates a complete model fixture with focused metadata overrides. */
function createModel(
  model: string,
  options: Partial<OpenCodexModel> = {}
): OpenCodexModel {
  return {
    id: `${model}-id`,
    model,
    displayName: model,
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    serviceTiers: [],
    ...options
  };
}

/** Creates one reasoning-effort fixture. */
function createEffort(reasoningEffort: string, description = ""): OpenCodexReasoningEffortOption {
  return { reasoningEffort, description };
}

describe("model selection helpers", () => {
  it("should preserve model options in catalog order and retain an absent selection", () => {
    const models = [
      createModel("gpt-5.5"),
      createModel("gpt-5.4"),
      createModel("gpt-5.5"),
      createModel("o4-mini")
    ];

    expect(getModelOptions(models, "custom-model")).toEqual([
      "custom-model",
      "gpt-5.5",
      "gpt-5.4",
      "gpt-5.5",
      "o4-mini"
    ]);
  });

  it("should keep a selected catalog model in its original position", () => {
    const models = [createModel("gpt-5.5"), createModel("gpt-5.4")];

    expect(getModelOptions(models, "gpt-5.4")).toEqual(["gpt-5.5", "gpt-5.4"]);
  });

  it("should derive commit options from the commit model independently of the chat selection", () => {
    const models = [createModel("gpt-5.5"), createModel("gpt-5.4")];

    expect(getCommitMessageModelOptions(models, "commit-model")).toEqual([
      "commit-model",
      "gpt-5.5",
      "gpt-5.4"
    ]);
    expect(getCommitMessageModelOptions(models, "gpt-5.4")).toEqual([
      "gpt-5.5",
      "gpt-5.4"
    ]);
  });

  it("should resolve an explicit model before the current, default, and first models", () => {
    const first = createModel("first-model");
    const defaultModel = createModel("default-model");
    const selected = createModel("selected-model");
    const explicit = createModel("explicit-model");
    const models = [first, defaultModel, selected, explicit];

    expect(findModel(models, "explicit-model", "selected-model", "default-model"))
      .toBe(explicit);
    expect(findModel(models, null, "selected-model", "default-model"))
      .toBe(selected);
    expect(findModel(models, null, null, "default-model"))
      .toBe(defaultModel);
    expect(findModel(models, null, null, null))
      .toBe(first);
  });

  it("should match a catalog entry by either its model name or its id", () => {
    const entry = createModel("gpt-5.5", { id: "model-record-55" });

    expect(findModel([entry], "gpt-5.5", null, null)).toBe(entry);
    expect(findModel([entry], "model-record-55", null, null)).toBe(entry);
  });

  it("should return service tiers for a model selected by name or id", () => {
    const entry = createModel("gpt-5.5", {
      id: "model-record-55",
      serviceTiers: [fastTier, batchTier]
    });

    expect(getServiceTierOptions([entry], "gpt-5.5")).toEqual([fastTier, batchTier]);
    expect(getServiceTierOptions([entry], "model-record-55")).toEqual([]);
    expect(getServiceTierOptions([entry], "unknown-model")).toEqual([]);
  });

  it("should expose model reasoning efforts and preserve their metadata", () => {
    const efforts = [
      createEffort("low", "Short responses"),
      createEffort("high", "More deliberation")
    ];
    const entry = createModel("gpt-5.5", {
      supportedReasoningEfforts: efforts,
      defaultReasoningEffort: "high"
    });

    expect(getReasoningEffortOptions([entry], "gpt-5.5", null, null)).toEqual(efforts);
    expect(getReasoningEffortOptions([entry], "gpt-5.5-id", null, null)).toEqual(efforts);
  });

  it("should use the global reasoning effort fallback when model metadata is missing", () => {
    const options = getReasoningEffortOptions([createModel("gpt-5.5")], "gpt-5.5", null, null);

    expect(options.map((option) => option.reasoningEffort))
      .toEqual(DEFAULT_OPEN_CODEX_REASONING_EFFORTS);
    expect(options.every((option) => option.description === "")).toBe(true);
  });

  it("should keep a requested supported effort", () => {
    const entry = createModel("gpt-5.5", {
      supportedReasoningEfforts: [createEffort("low"), createEffort("high")],
      defaultReasoningEffort: "high"
    });

    expect(resolveReasoningEffort([entry], "gpt-5.5", null, null, "low")).toBe("low");
  });

  it("should use the model default for an invalid or null requested effort", () => {
    const entry = createModel("gpt-5.5", {
      supportedReasoningEfforts: [createEffort("low"), createEffort("high")],
      defaultReasoningEffort: "high"
    });

    expect(resolveReasoningEffort([entry], "gpt-5.5", null, null, "medium")).toBe("high");
    expect(resolveReasoningEffort([entry], "gpt-5.5", null, null, null)).toBe("high");
  });

  it("should use the first supported effort when no model default is usable", () => {
    const entry = createModel("gpt-5.5", {
      supportedReasoningEfforts: [createEffort("low"), createEffort("high")],
      defaultReasoningEffort: "medium"
    });

    expect(resolveReasoningEffort([entry], "gpt-5.5", null, null, "xhigh")).toBe("low");
  });

  it("should resolve an invalid effort against the selected, default, then first model", () => {
    const first = createModel("first-model", {
      supportedReasoningEfforts: [createEffort("low")],
      defaultReasoningEffort: "low"
    });
    const defaultModel = createModel("default-model", {
      supportedReasoningEfforts: [createEffort("high")],
      defaultReasoningEffort: "high"
    });
    const selected = createModel("selected-model", {
      supportedReasoningEfforts: [createEffort("xhigh")],
      defaultReasoningEffort: "xhigh"
    });
    const models = [first, defaultModel, selected];

    expect(resolveReasoningEffort(models, null, "selected-model", "default-model", "invalid"))
      .toBe("xhigh");
    expect(resolveReasoningEffort(models, null, null, "default-model", "invalid"))
      .toBe("high");
    expect(resolveReasoningEffort(models, null, null, null, "invalid"))
      .toBe("low");
  });
});
