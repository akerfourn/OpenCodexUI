import {
  DEFAULT_LOG_POLICIES
} from "@open-codex-ui/opencodex-protocol";
import type {
  OpenCodexLogPolicies,
  OpenCodexLogPolicy,
  OpenCodexLogType,
  OpenCodexSettings
} from "@open-codex-ui/opencodex-protocol";

/** Maximum number of UTF-8 bytes held by the process-local log buffer. */
export const MAX_SESSION_LOG_BYTES = 5 * 1024 * 1024;

/** Default number of logs returned by the public log API. */
export const DEFAULT_LOG_PAGE_SIZE = 30;

/** Maximum number of logs returned by one public log request. */
export const MAX_LOG_PAGE_SIZE = 200;

/** Maximum accepted session entries for one policy. */
export const MAX_SESSION_LOG_ENTRIES = 10_000;

/** Maximum accepted age for one retained policy. */
export const MAX_LOG_RETENTION_DAYS = 3_650;

/** Log policy snapshot used by the application log service. */
export type ApplicationLogPolicies = OpenCodexLogPolicies;

/** Returns an independent copy of the default policy snapshot. */
export function createDefaultLogPolicies(): ApplicationLogPolicies {
  return {
    info: { ...DEFAULT_LOG_POLICIES.info },
    performanceSlowdown: { ...DEFAULT_LOG_POLICIES.performanceSlowdown }
  };
}

/**
 * Reads policies from legacy or current settings.
 *
 * Legacy settings did not contain `logPolicies`, so they use the documented
 * defaults without mutating the settings object before it is saved.
 *
 * @param settings Settings snapshot to inspect.
 * @returns A validated, independent policy snapshot.
 */
export function readLogPolicies(
  settings: Pick<OpenCodexSettings, "logPolicies"> | null | undefined
): ApplicationLogPolicies {
  if (settings?.logPolicies === undefined) {
    return createDefaultLogPolicies();
  }

  return validateLogPolicies(settings.logPolicies);
}

/**
 * Validates the exact settings shape accepted for log policies.
 *
 * @param value Unknown settings value received from persistence or IPC.
 * @returns A safe policy snapshot.
 * @throws Error when a policy has an unknown field or unsafe bound.
 */
export function validateLogPolicies(value: unknown): ApplicationLogPolicies {
  assertRecord(value, "logPolicies");
  assertExactKeys(value, ["info", "performanceSlowdown"], "logPolicies");

  return {
    info: validateLogPolicy(value.info, "logPolicies.info"),
    performanceSlowdown: validateLogPolicy(
      value.performanceSlowdown,
      "logPolicies.performanceSlowdown"
    )
  };
}

/**
 * Selects the policy for one log.
 *
 * Category-specific rules are checked before severity, while warnings and
 * errors without a category retain the historical unlimited behavior.
 *
 * @param type Log severity.
 * @param category Optional semantic category.
 * @param policies Current policy snapshot.
 * @returns Effective policy for the log.
 */
export function resolveLogPolicy(
  type: OpenCodexLogType,
  category: "performanceSlowdown" | undefined,
  policies: ApplicationLogPolicies
): OpenCodexLogPolicy {
  if (category === "performanceSlowdown") {
    return policies.performanceSlowdown;
  }

  if (type === "info") {
    return policies.info;
  }

  return { mode: "unlimited" };
}

/** Compares policy snapshots without serializing settings or relying on key order. */
export function areLogPoliciesEqual(
  left: ApplicationLogPolicies,
  right: ApplicationLogPolicies
): boolean {
  return areLogPoliciesForCategoryEqual(left.info, right.info)
    && areLogPoliciesForCategoryEqual(left.performanceSlowdown, right.performanceSlowdown);
}

/** Compares one discriminated policy and its mode-specific bound. */
function areLogPoliciesForCategoryEqual(
  left: OpenCodexLogPolicy,
  right: OpenCodexLogPolicy
): boolean {
  if (left.mode !== right.mode) {
    return false;
  }

  if (left.mode === "session" && right.mode === "session") {
    return left.maxEntries === right.maxEntries;
  }

  if (left.mode === "retained" && right.mode === "retained") {
    return left.retentionDays === right.retentionDays;
  }

  return true;
}

/** Validates one discriminated policy while rejecting irrelevant fields. */
function validateLogPolicy(value: unknown, path: string): OpenCodexLogPolicy {
  assertRecord(value, path);

  if (value.mode === "disabled" || value.mode === "unlimited") {
    assertExactKeys(value, ["mode"], path);
    return { mode: value.mode };
  }

  if (value.mode === "session") {
    assertExactKeys(value, ["mode", "maxEntries"], path);
    assertSafePositiveInteger(value.maxEntries, 1, MAX_SESSION_LOG_ENTRIES, `${path}.maxEntries`);
    return { mode: "session", maxEntries: value.maxEntries };
  }

  if (value.mode === "retained") {
    assertExactKeys(value, ["mode", "retentionDays"], path);
    assertSafePositiveInteger(
      value.retentionDays,
      1,
      MAX_LOG_RETENTION_DAYS,
      `${path}.retentionDays`
    );
    return { mode: "retained", retentionDays: value.retentionDays };
  }

  throw new Error(`${path}.mode must be disabled, session, retained, or unlimited.`);
}

/** Checks that a value is an object with string keys. */
function assertRecord(value: unknown, path: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
}

/** Rejects missing and unknown fields from a settings object. */
function assertExactKeys(
  value: Record<string, unknown>,
  expectedKeys: string[],
  path: string
): void {
  const actualKeys = Object.keys(value).sort();
  const sortedExpectedKeys = [...expectedKeys].sort();

  if (
    actualKeys.length !== sortedExpectedKeys.length
    || actualKeys.some((key, index) => key !== sortedExpectedKeys[index])
  ) {
    throw new Error(`${path} has an invalid shape.`);
  }
}

/** Checks an integer bound that is safe to retain in JSON settings. */
function assertSafePositiveInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  path: string
): asserts value is number {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < minimum
    || value > maximum
  ) {
    throw new Error(`${path} must be a safe integer between ${minimum} and ${maximum}.`);
  }
}
