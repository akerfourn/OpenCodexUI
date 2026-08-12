import { describe, expect, it } from "vitest";

import {
  readBoundedNumberRecord,
  readRendererMarkdownPerformanceSample,
  readRendererPerformanceSample
} from "../src/main/rendererPerformancePayload";

const MAX_METRIC = 1_000_000_000;
const CAPTURED_AT = "2026-08-12T00:00:00.000Z";

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

type NumericField = (typeof numericFields)[number];

describe("renderer performance payload readers", () => {
  it("should read a complete sample, ignore unknown fields, and clamp metrics", () => {
    const payload = createSample({
      ...Object.fromEntries(numericFields.map((field) => [field, MAX_METRIC + 1])),
      eventTypeCounts: { "message.delta": MAX_METRIC + 1 },
      eventTypeMaxDurationMs: { "message.delta": 7 },
      markdown: createMarkdownSample(),
      unknownField: "discarded"
    });

    expect(readRendererPerformanceSample(payload)).toEqual({
      capturedAt: CAPTURED_AT,
      isDocumentVisible: true,
      intervalMs: MAX_METRIC,
      eventLoopDelayMs: MAX_METRIC,
      longTaskCount: MAX_METRIC,
      longTaskDurationMs: MAX_METRIC,
      maxLongTaskDurationMs: MAX_METRIC,
      processedEventCount: MAX_METRIC,
      estimatedEventBytes: MAX_METRIC,
      maxEventHandlingDurationMs: MAX_METRIC,
      eventTypeCounts: { "message.delta": MAX_METRIC },
      eventTypeMaxDurationMs: { "message.delta": 7 },
      markdown: createMarkdownSample()
    });
  });

  it.each([null, undefined, [], "sample", 42, true])(
    "should reject a non-object sample root: %s",
    (value) => {
      expect(readRendererPerformanceSample(value)).toBeNull();
    }
  );

  it.each([undefined, null, 42, "not-a-date", ""])(
    "should reject an invalid captured date: %s",
    (value) => {
      expect(readRendererPerformanceSample(createSample({ capturedAt: value }))).toBeNull();
    }
  );

  it("should reject captured dates longer than 50 characters", () => {
    const longDate = `${"2020-01-01"}${" ".repeat(50)}`;

    expect(readRendererPerformanceSample(createSample({ capturedAt: longDate }))).toBeNull();
  });

  it("should accept a non-ISO date recognized by Date.parse", () => {
    expect(readRendererPerformanceSample(createSample({ capturedAt: "2020-01-01" }))).toEqual(
      expect.objectContaining({ capturedAt: "2020-01-01" })
    );
  });

  it.each([undefined, null, 0, 1, "true"])(
    "should reject an invalid document visibility flag: %s",
    (value) => {
      expect(readRendererPerformanceSample(
        createSample({ isDocumentVisible: value })
      )).toBeNull();
    }
  );

  const invalidNumericCases = numericFields.flatMap((field) => [
    { field, kind: "missing", value: undefined },
    { field, kind: "negative", value: -1 },
    { field, kind: "NaN", value: Number.NaN },
    { field, kind: "infinity", value: Number.POSITIVE_INFINITY }
  ]);

  it.each(invalidNumericCases)(
    "should reject a sample when $field is $kind",
    ({ field, value }: { field: NumericField; value: unknown }) => {
      const payload = createSample();

      if (value === undefined) {
        delete payload[field];
      } else {
        payload[field] = value;
      }

      expect(readRendererPerformanceSample(payload)).toBeNull();
    }
  );

  it.each([undefined, null, [], "record", 1, true])(
    "should omit malformed bounded records: %s",
    (value) => {
      expect(readBoundedNumberRecord(value)).toBeNull();
    }
  );

  it("should skip invalid record values without rejecting valid entries", () => {
    expect(readBoundedNumberRecord({
      valid: 4,
      negative: -1,
      nan: Number.NaN,
      infinity: Number.POSITIVE_INFINITY,
      text: "4",
      empty: null
    })).toEqual({ valid: 4 });
  });

  it("should preserve an empty bounded record", () => {
    expect(readBoundedNumberRecord({})).toEqual({});
  });

  it("should clamp record values and truncate colliding keys", () => {
    const truncatedKey = "x".repeat(100);
    const longKey = `${truncatedKey}x`;

    expect(readBoundedNumberRecord({
      [longKey]: 3,
      [truncatedKey]: MAX_METRIC + 1
    })).toEqual({ [truncatedKey]: MAX_METRIC });
  });

  it("should inspect only the first 100 record entries before filtering", () => {
    const entries: Array<[string, unknown]> = Array.from(
      { length: 100 },
      (_, index) => [`invalid-${index}`, -1]
    );
    entries.push(["after-limit", 7]);

    expect(readBoundedNumberRecord(Object.fromEntries(entries))).toEqual({});
  });

  it("should omit malformed optional fields without rejecting the sample", () => {
    const result = readRendererPerformanceSample(createSample({
      eventTypeCounts: null,
      eventTypeMaxDurationMs: [],
      markdown: { plainRenderCount: 1 }
    }));

    expect(result).toEqual(expect.objectContaining({
      capturedAt: CAPTURED_AT,
      isDocumentVisible: true,
      intervalMs: 100,
      processedEventCount: 100
    }));
    expect(result).not.toHaveProperty("eventTypeCounts");
    expect(result).not.toHaveProperty("eventTypeMaxDurationMs");
    expect(result).not.toHaveProperty("markdown");
  });

  it("should preserve non-negative decimal metrics in samples, records, and Markdown", () => {
    const result = readRendererPerformanceSample(createSample({
      intervalMs: 1.5,
      eventTypeCounts: { fractional: 2.25 },
      markdown: createMarkdownSample({ plainRenderDurationMs: 3.75 })
    }));

    expect(result).toEqual(expect.objectContaining({
      intervalMs: 1.5,
      eventTypeCounts: { fractional: 2.25 },
      markdown: expect.objectContaining({ plainRenderDurationMs: 3.75 })
    }));
  });

  it("should omit an absent Markdown sample", () => {
    expect(readRendererMarkdownPerformanceSample(undefined)).toBeNull();
  });

  it.each([null, [], "markdown", 1])(
    "should omit malformed Markdown samples: %s",
    (value) => {
      expect(readRendererMarkdownPerformanceSample(value)).toBeNull();
    }
  );

  it("should omit an incomplete Markdown sample", () => {
    const markdown = createMarkdownSample();
    delete markdown.maxMarkdownLength;

    expect(readRendererMarkdownPerformanceSample(markdown)).toBeNull();
  });

  it("should read and clamp a complete Markdown sample", () => {
    expect(readRendererMarkdownPerformanceSample({
      plainRenderCount: MAX_METRIC + 1,
      plainRenderDurationMs: MAX_METRIC + 1,
      maxPlainRenderDurationMs: MAX_METRIC + 1,
      highlightedRenderCount: MAX_METRIC + 1,
      highlightedRenderDurationMs: MAX_METRIC + 1,
      maxHighlightedRenderDurationMs: MAX_METRIC + 1,
      maxMarkdownLength: MAX_METRIC + 1
    })).toEqual({
      plainRenderCount: MAX_METRIC,
      plainRenderDurationMs: MAX_METRIC,
      maxPlainRenderDurationMs: MAX_METRIC,
      highlightedRenderCount: MAX_METRIC,
      highlightedRenderDurationMs: MAX_METRIC,
      maxHighlightedRenderDurationMs: MAX_METRIC,
      maxMarkdownLength: MAX_METRIC
    });
  });
});

/** Creates a valid renderer sample that can be amended for one test case. */
function createSample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    capturedAt: CAPTURED_AT,
    isDocumentVisible: true,
    intervalMs: 100,
    eventLoopDelayMs: 1,
    longTaskCount: 2,
    longTaskDurationMs: 3,
    maxLongTaskDurationMs: 4,
    processedEventCount: 100,
    estimatedEventBytes: 200,
    maxEventHandlingDurationMs: 5,
    ...overrides
  };
}

/** Creates a complete Markdown aggregate for renderer payload fixtures. */
function createMarkdownSample(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    plainRenderCount: 1,
    plainRenderDurationMs: 2,
    maxPlainRenderDurationMs: 3,
    highlightedRenderCount: 4,
    highlightedRenderDurationMs: 5,
    maxHighlightedRenderDurationMs: 6,
    maxMarkdownLength: 7,
    ...overrides
  };
}
