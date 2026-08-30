import type { OpenCodexRendererPerformanceSample } from "@open-codex-ui/opencodex-protocol";

/**
 * Validates and bounds a renderer performance sample received through IPC.
 *
 * @param value Untrusted renderer payload.
 * @returns Safe sample, or `null` when the payload is invalid.
 */
export function readRendererPerformanceSample(
  value: unknown
): OpenCodexRendererPerformanceSample | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const sample = value as Record<string, unknown>;
  const capturedAt = typeof sample.capturedAt === "string" ? sample.capturedAt : null;
  const isDocumentVisible = sample.isDocumentVisible;

  if (
    capturedAt === null ||
    capturedAt.length > 50 ||
    Number.isNaN(Date.parse(capturedAt)) ||
    typeof isDocumentVisible !== "boolean"
  ) {
    return null;
  }

  const numericFields = [
    "intervalMs",
    "eventLoopDelayMs",
    "longTaskCount",
    "longTaskDurationMs",
    "maxLongTaskDurationMs",
    "processedEventCount",
    "estimatedEventBytes",
    "maxEventHandlingDurationMs"
  ] as const;
  const numbers: Record<(typeof numericFields)[number], number> = {
    intervalMs: 0,
    eventLoopDelayMs: 0,
    longTaskCount: 0,
    longTaskDurationMs: 0,
    maxLongTaskDurationMs: 0,
    processedEventCount: 0,
    estimatedEventBytes: 0,
    maxEventHandlingDurationMs: 0
  };

  for (const field of numericFields) {
    const fieldValue = sample[field];

    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 0) {
      return null;
    }

    numbers[field] = Math.min(fieldValue, 1_000_000_000);
  }

  const result: OpenCodexRendererPerformanceSample = {
    capturedAt,
    isDocumentVisible,
    ...numbers
  };
  const optionalNumericFields = ["requestCount", "maxRequestDurationMs"] as const;

  for (const field of optionalNumericFields) {
    const fieldValue = sample[field];

    if (fieldValue === undefined) {
      continue;
    }

    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 0) {
      return null;
    }

    result[field] = Math.min(fieldValue, 1_000_000_000);
  }

  const requestTypeCounts = readBoundedNumberRecord(sample.requestTypeCounts);

  if (requestTypeCounts !== null) {
    result.requestTypeCounts = requestTypeCounts;
  }

  const requestTypeMaxDurationMs = readBoundedNumberRecord(sample.requestTypeMaxDurationMs);

  if (requestTypeMaxDurationMs !== null) {
    result.requestTypeMaxDurationMs = requestTypeMaxDurationMs;
  }

  const eventTypeCounts = readBoundedNumberRecord(sample.eventTypeCounts);

  if (eventTypeCounts !== null) {
    result.eventTypeCounts = eventTypeCounts;
  }

  const eventTypeMaxDurationMs = readBoundedNumberRecord(sample.eventTypeMaxDurationMs);

  if (eventTypeMaxDurationMs !== null) {
    result.eventTypeMaxDurationMs = eventTypeMaxDurationMs;
  }

  const markdown = readRendererMarkdownPerformanceSample(sample.markdown);

  if (markdown !== null) {
    result.markdown = markdown;
  }

  return result;
}

/**
 * Validates content-free Markdown timing aggregates received from the renderer.
 *
 * @param value Candidate Markdown timing sample.
 * @returns Safe timing sample, or `null` when omitted or invalid.
 */
export function readRendererMarkdownPerformanceSample(
  value: unknown
): OpenCodexRendererPerformanceSample["markdown"] | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const sample = value as Record<string, unknown>;
  const fields = [
    "plainRenderCount",
    "plainRenderDurationMs",
    "maxPlainRenderDurationMs",
    "highlightedRenderCount",
    "highlightedRenderDurationMs",
    "maxHighlightedRenderDurationMs",
    "maxMarkdownLength"
  ] as const;
  const result = {} as NonNullable<OpenCodexRendererPerformanceSample["markdown"]>;

  for (const field of fields) {
    const fieldValue = sample[field];

    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 0) {
      return null;
    }

    result[field] = Math.min(fieldValue, 1_000_000_000);
  }

  return result;
}

/**
 * Reads a bounded map of event counters from an IPC payload.
 *
 * @param value Candidate numeric metric map.
 * @returns Safe numeric values, or `null` when omitted or invalid.
 */
export function readBoundedNumberRecord(value: unknown): Record<string, number> | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const numbers: Record<string, number> = {};

  for (const [key, numberValue] of Object.entries(value).slice(0, 100)) {
    if (
      typeof numberValue !== "number" ||
      !Number.isFinite(numberValue) ||
      numberValue < 0
    ) {
      continue;
    }

    numbers[key.slice(0, 100)] = Math.min(numberValue, 1_000_000_000);
  }

  return numbers;
}
