/**
 * Reads typed values from Codex app-server responses.
 */
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexModel, OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import { mapThread, readObject, readString } from "../mapping.js";
import { THREAD_LIST_MAX_PAGES, type ThreadListParams } from "./constants.js";

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

export function readThreads(response: unknown): OpenCodexThread[] {
  const data = readObject(response).data;

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((thread) => mapThread(thread));
}

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

export function readReasoningEffort(value: unknown): "low" | "medium" | "high" | "xhigh" | null {
  if (value === "low" || value === "medium" || value === "high" || value === "xhigh") {
    return value;
  }

  return null;
}

export function fallbackModels(): OpenCodexModel[] {
  return ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex"].map((model) => ({
    id: model,
    model,
    displayName: model,
    serviceTiers: []
  }));
}

function readModel(value: Record<string, unknown>): OpenCodexModel {
  const id = readString(value.model) || readString(value.id);
  const displayName = readString(value.displayName) || id;
  const serviceTiers = Array.isArray(value.serviceTiers)
    ? value.serviceTiers.map((tier) => readModelServiceTier(readObject(tier)))
    : [];

  return {
    id,
    model: id,
    displayName,
    serviceTiers: serviceTiers.filter((tier) => tier.id.length > 0)
  };
}

function readModelServiceTier(value: Record<string, unknown>): OpenCodexModel["serviceTiers"][number] {
  const id = readString(value.id);

  return {
    id,
    name: readString(value.name) || id,
    description: readString(value.description)
  };
}
