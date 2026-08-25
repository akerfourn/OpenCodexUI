/**
 * Reads typed values from Codex app-server responses.
 */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import {
  DEFAULT_OPEN_CODEX_REASONING_EFFORTS,
  type OpenCodexModel,
  type OpenCodexReasoningEffort,
  type OpenCodexReasoningEffortOption,
  type OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import { mapThread, readObject, readString } from "../../mapping.js";
import { THREAD_LIST_MAX_PAGES, type ThreadListParams } from "./constants.js";

/**
 * Reads all available thread pages until Codex stops returning a cursor.
 *
 * @param client Codex app-server client.
 * @param baseParams Initial thread list parameters.
 * @returns Aggregated thread DTOs.
 */
export async function readThreadPages(
  client: CodexAppServerClient,
  baseParams: ThreadListParams
): Promise<OpenCodexThread[]> {
  const threads: OpenCodexThread[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < THREAD_LIST_MAX_PAGES; page += 1) {
    const params = cursor === null ? baseParams : { ...baseParams, cursor };
    const response = await client.listThreads(params);
    threads.push(...readThreads(response));
    cursor = readString(readObject(response).nextCursor) || null;

    if (cursor === null) {
      break;
    }
  }

  return threads;
}

/**
 * Reads paginated thread rows from a Codex list response.
 *
 * @param response Raw `thread/list` response.
 * @returns Protocol thread DTOs.
 */
export function readThreads(response: unknown): OpenCodexThread[] {
  const data = readObject(response).data;

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((thread) => mapThread(thread));
}

/**
 * Reads available Codex models from an app-server response.
 *
 * @param response Raw `model/list` response.
 * @returns Models with empty identifiers filtered out.
 */
export function readModels(response: unknown): OpenCodexModel[] {
  const data = readObject(response).data;

  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((model) => readObject(model))
    .map(readModel)
    .filter((model) => model.id.length > 0);
}

/**
 * Normalizes one reasoning effort value from Codex or local cache data.
 *
 * @param value Raw effort value.
 * @returns Supported reasoning effort, or `null` when unknown.
 */
export function readReasoningEffort(value: unknown): OpenCodexReasoningEffort | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

/**
 * Provides a stable model list when the CLI cannot return model metadata.
 *
 * @returns Conservative fallback model definitions.
 */
export function fallbackModels(): OpenCodexModel[] {
  return ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"].map((model) => ({
    id: model,
    model,
    displayName: model,
    supportedReasoningEfforts: DEFAULT_OPEN_CODEX_REASONING_EFFORTS.map((reasoningEffort) => ({
      reasoningEffort,
      description: ""
    })),
    defaultReasoningEffort: "medium",
    serviceTiers: []
  }));
}

/**
 * Maps one raw model record to the protocol representation.
 *
 * @param value Raw model object.
 * @returns Model DTO, possibly with an empty id for caller-side filtering.
 */
function readModel(value: Record<string, unknown>): OpenCodexModel {
  const id = readString(value.model) || readString(value.id);
  const displayName = readString(value.displayName) || id;
  const supportedReasoningEfforts = readReasoningEfforts(
    value.supportedReasoningEfforts ?? value.supportedReasoningLevels
  );
  const serviceTiers = Array.isArray(value.serviceTiers)
    ? value.serviceTiers.map((tier) => readModelServiceTier(readObject(tier)))
    : [];

  return {
    id,
    model: id,
    displayName,
    supportedReasoningEfforts,
    defaultReasoningEffort: readReasoningEffort(
      value.defaultReasoningEffort ?? value.defaultReasoningLevel
    ),
    serviceTiers: serviceTiers.filter((tier) => tier.id.length > 0)
  };
}

/**
 * Reads the reasoning levels advertised by one model.
 *
 * @param value Raw supported-effort collection.
 * @returns Unique supported reasoning options.
 */
function readReasoningEfforts(value: unknown): OpenCodexReasoningEffortOption[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const options: OpenCodexReasoningEffortOption[] = [];
  const seenEfforts = new Set<OpenCodexReasoningEffort>();

  for (const entry of value) {
    const record = readObject(entry);
    const reasoningEffort = readReasoningEffort(
      typeof entry === "string" ? entry : record.reasoningEffort ?? record.effort
    );

    if (reasoningEffort === null || seenEfforts.has(reasoningEffort)) {
      continue;
    }

    seenEfforts.add(reasoningEffort);
    options.push({
      reasoningEffort,
      description: readString(record.description)
    });
  }

  return options;
}

/**
 * Maps one raw service-tier record attached to a model.
 *
 * @param value Raw service-tier object.
 * @returns Service-tier DTO.
 */
function readModelServiceTier(value: Record<string, unknown>): OpenCodexModel["serviceTiers"][number] {
  const id = readString(value.id);

  return {
    id,
    name: readString(value.name) || id,
    description: readString(value.description)
  };
}
