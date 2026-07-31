/**
 * Builds source-scoped immutable rate-limit history entries.
 */
import crypto from "node:crypto";

import type { CachedUsageRateLimitSnapshot } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexUsageLimits, OpenCodexUsageSnapshot } from "@open-codex-ui/opencodex-protocol";

import type {
  UsageRateLimitLogOrigin,
  UsageRateLimitLogReason
} from "./usageRateLimitDiagnostics.js";

/**
 * Creates one history entry while preserving both the raw Codex payload and
 * the normalized snapshot currently understood by OpenCodexUI.
 *
 * @param sourceId Source that produced the payload.
 * @param rawPayload Original response or notification parameters.
 * @param usage Corrected normalized usage snapshot.
 * @param origin Payload origin.
 * @param reason Reason for receiving the payload.
 * @returns Cache entry ready for persistence.
 */
export function createUsageRateLimitHistorySnapshot(
  sourceId: string,
  rawPayload: unknown,
  usage: OpenCodexUsageSnapshot,
  origin: UsageRateLimitLogOrigin,
  reason: UsageRateLimitLogReason
): CachedUsageRateLimitSnapshot {
  const normalizedUsage = {
    ...usage,
    sourceId
  };

  return {
    sourceId,
    observedAt: usage.updatedAt,
    origin,
    reason,
    fingerprint: createUsageRateLimitFingerprint(usage.limits),
    payloadJson: stringifyPayload({
      raw: rawPayload,
      mapped: normalizedUsage
    })
  };
}

/**
 * Creates a stable fingerprint for effective rate-limit values.
 *
 * Reset-credit metadata is deliberately excluded because it is not a rate
 * limit and is absent from sparse account notifications.
 *
 * @param limits Effective limits to fingerprint.
 * @returns SHA-256 fingerprint.
 */
function createUsageRateLimitFingerprint(limits: OpenCodexUsageLimits[]): string {
  const sortedLimits = limits
    .map((limit, index) => ({
      key: limit.limitId ?? `__missing__${index}`,
      limit
    }))
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(({ limit }) => limit);

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(sortedLimits), "utf8")
    .digest("hex");
}

/**
 * Serializes a raw Codex payload without losing bigint values produced by a
 * generated RPC decoder.
 *
 * @param payload Payload envelope to serialize.
 * @returns JSON document suitable for SQLite storage.
 */
function stringifyPayload(payload: { raw: unknown; mapped: OpenCodexUsageSnapshot }): string {
  try {
    return JSON.stringify(payload, (_key, value: unknown) => (
      typeof value === "bigint" ? value.toString() : value
    ));
  } catch {
    return JSON.stringify({
      raw: String(payload.raw),
      mapped: payload.mapped
    });
  }
}
