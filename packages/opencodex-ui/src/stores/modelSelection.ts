import { DEFAULT_OPEN_CODEX_REASONING_EFFORTS } from "@open-codex-ui/opencodex-protocol";

import type {
  OpenCodexModel,
  OpenCodexModelServiceTier,
  OpenCodexReasoningEffort,
  OpenCodexReasoningEffortOption
} from "@open-codex-ui/opencodex-protocol";

/**
 * Builds model choices while preserving a selected value absent from the catalog.
 *
 * @param models Available model metadata.
 * @param selectedModel Currently selected model value.
 * @returns Model option list.
 */
export function getModelOptions(
  models: readonly OpenCodexModel[],
  selectedModel: string | null
): string[] {
  const options = models.map((model) => model.model);

  if (selectedModel !== null && !options.includes(selectedModel)) {
    options.unshift(selectedModel);
  }

  return options;
}

/**
 * Builds commit-message model choices while preserving a configured value absent from the catalog.
 *
 * @param models Available model metadata.
 * @param selectedModel Configured commit-message model value.
 * @returns Model option list.
 */
export function getCommitMessageModelOptions(
  models: readonly OpenCodexModel[],
  selectedModel: string | null
): string[] {
  const options = models.map((model) => model.model);

  if (selectedModel !== null && !options.includes(selectedModel)) {
    options.unshift(selectedModel);
  }

  return options;
}

/**
 * Finds model metadata using the historical selection precedence.
 *
 * An explicit model value is matched against either the model name or its metadata identifier.
 * When no explicit value is provided, the selected model, configured default, and first catalog
 * model are considered in that order.
 *
 * @param models Available model metadata.
 * @param model Explicit model value, or `null` for the current default.
 * @param selectedModel Currently selected model value.
 * @param defaultModel Configured default model value.
 * @returns Matching model metadata, or `undefined`.
 */
export function findModel(
  models: readonly OpenCodexModel[],
  model: string | null,
  selectedModel: string | null,
  defaultModel: string | null
): OpenCodexModel | undefined {
  const modelId = model
    ?? selectedModel
    ?? defaultModel
    ?? models[0]?.model
    ?? null;

  if (modelId === null) {
    return undefined;
  }

  return models.find((entry) => entry.model === modelId || entry.id === modelId);
}

/**
 * Returns service tiers for a model name.
 *
 * @param models Available model metadata.
 * @param model Model name, or `null` when no model is selected.
 * @returns Service tiers advertised by the matching model.
 */
export function getServiceTierOptions(
  models: readonly OpenCodexModel[],
  model: string | null
): OpenCodexModelServiceTier[] {
  if (model === null) {
    return [];
  }

  return models.find((entry) => entry.model === model)?.serviceTiers ?? [];
}

/**
 * Returns reasoning efforts supported by a model, or conservative fallback efforts.
 *
 * @param models Available model metadata.
 * @param model Explicit model value, or `null` for the current default.
 * @param selectedModel Currently selected model value.
 * @param defaultModel Configured default model value.
 * @returns Model-specific efforts, or fallback efforts with empty descriptions.
 */
export function getReasoningEffortOptions(
  models: readonly OpenCodexModel[],
  model: string | null,
  selectedModel: string | null,
  defaultModel: string | null
): OpenCodexReasoningEffortOption[] {
  const modelEntry = findModel(models, model, selectedModel, defaultModel);

  if (modelEntry !== undefined && modelEntry.supportedReasoningEfforts.length > 0) {
    return modelEntry.supportedReasoningEfforts;
  }

  return DEFAULT_OPEN_CODEX_REASONING_EFFORTS.map((reasoningEffort) => ({
    reasoningEffort,
    description: ""
  }));
}

/**
 * Keeps a reasoning effort valid when the selected model changes.
 *
 * @param models Available model metadata.
 * @param model Explicit model value, or `null` for the current default.
 * @param selectedModel Currently selected model value.
 * @param defaultModel Configured default model value.
 * @param reasoningEffort Current effort.
 * @returns Current effort, model default, first option, or `medium` fallback.
 */
export function resolveReasoningEffort(
  models: readonly OpenCodexModel[],
  model: string | null,
  selectedModel: string | null,
  defaultModel: string | null,
  reasoningEffort: OpenCodexReasoningEffort
): OpenCodexReasoningEffort {
  const options = getReasoningEffortOptions(models, model, selectedModel, defaultModel);

  if (options.some((option) => option.reasoningEffort === reasoningEffort)) {
    return reasoningEffort;
  }

  const modelEntry = findModel(models, model, selectedModel, defaultModel);
  const defaultReasoningEffort = modelEntry?.defaultReasoningEffort;

  if (
    defaultReasoningEffort !== null &&
    defaultReasoningEffort !== undefined &&
    options.some((option) => option.reasoningEffort === defaultReasoningEffort)
  ) {
    return defaultReasoningEffort;
  }

  return options[0]?.reasoningEffort ?? "medium";
}
