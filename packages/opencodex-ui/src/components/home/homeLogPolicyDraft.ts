import {
  DEFAULT_LOG_POLICIES,
  type OpenCodexLogPolicies,
  type OpenCodexLogPolicy
} from "@open-codex-ui/opencodex-protocol";

/** Categories configurable from the application log policy dialog. */
export const LOG_POLICY_CATEGORIES = ["info", "performanceSlowdown"] as const;

/** A category accepted by the log policy dialog. */
export type LogPolicyCategory = (typeof LOG_POLICY_CATEGORIES)[number];

/** Numeric values remain empty while a user is editing an invalid field. */
export type LogPolicyDraftNumber = number | "";

/** Editable representation of one log policy row. */
export type LogPolicyDraftPolicy = {
  mode: OpenCodexLogPolicy["mode"];
  maxEntries: LogPolicyDraftNumber;
  retentionDays: LogPolicyDraftNumber;
};

/** Editable representation of all log policy rows. */
export type LogPolicyDraft = Record<LogPolicyCategory, LogPolicyDraftPolicy>;

/** Field validation errors shown next to the affected numeric input. */
export type LogPolicyDraftErrors = Partial<Record<LogPolicyCategory, {
  maxEntries?: "invalid";
  retentionDays?: "invalid";
}>>;

const MAX_INFO_ENTRIES = 10_000;
const MAX_RETENTION_DAYS = 3_650;

/** Creates an independent draft, using protocol defaults for omitted settings. */
export function createLogPolicyDraft(policies?: OpenCodexLogPolicies): LogPolicyDraft {
  const source = policies ?? DEFAULT_LOG_POLICIES;

  return {
    info: createPolicyDraft(source.info, DEFAULT_LOG_POLICIES.info),
    performanceSlowdown: createPolicyDraft(
      source.performanceSlowdown,
      DEFAULT_LOG_POLICIES.performanceSlowdown
    )
  };
}

/** Validates only numeric fields that are active for their selected mode. */
export function validateLogPolicyDraft(draft: LogPolicyDraft): LogPolicyDraftErrors {
  const errors: LogPolicyDraftErrors = {};

  for (const category of LOG_POLICY_CATEGORIES) {
    const policy = draft[category];
    const categoryErrors: NonNullable<LogPolicyDraftErrors[LogPolicyCategory]> = {};

    if (policy.mode === "session" && !isIntegerInRange(policy.maxEntries, 1, MAX_INFO_ENTRIES)) {
      categoryErrors.maxEntries = "invalid";
    }

    if (
      policy.mode === "retained" &&
      !isIntegerInRange(policy.retentionDays, 1, MAX_RETENTION_DAYS)
    ) {
      categoryErrors.retentionDays = "invalid";
    }

    if (Object.keys(categoryErrors).length > 0) {
      errors[category] = categoryErrors;
    }
  }

  return errors;
}

/** Converts a valid draft into the plain protocol DTO sent to the backend. */
export function toOpenCodexLogPolicies(draft: LogPolicyDraft): OpenCodexLogPolicies | null {
  if (Object.keys(validateLogPolicyDraft(draft)).length > 0) {
    return null;
  }

  return {
    info: toOpenCodexLogPolicy(draft.info),
    performanceSlowdown: toOpenCodexLogPolicy(draft.performanceSlowdown)
  };
}

/** Returns true for a positive, bounded integer and false for an empty draft field. */
function isIntegerInRange(value: LogPolicyDraftNumber, minimum: number, maximum: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= minimum && value <= maximum;
}

/** Copies one persisted union into the editable fields used by the form. */
function createPolicyDraft(
  policy: OpenCodexLogPolicy,
  fallback: OpenCodexLogPolicy
): LogPolicyDraftPolicy {
  const fallbackMaxEntries = fallback.mode === "session" ? fallback.maxEntries : 200;
  const fallbackRetentionDays = fallback.mode === "retained" ? fallback.retentionDays : 7;

  return {
    mode: policy.mode,
    maxEntries: policy.mode === "session" ? policy.maxEntries : fallbackMaxEntries,
    retentionDays: policy.mode === "retained" ? policy.retentionDays : fallbackRetentionDays
  };
}

/** Builds the discriminated union after validation has established its numeric field. */
function toOpenCodexLogPolicy(draft: LogPolicyDraftPolicy): OpenCodexLogPolicy {
  if (draft.mode === "session") {
    return { mode: "session", maxEntries: draft.maxEntries as number };
  }

  if (draft.mode === "retained") {
    return { mode: "retained", retentionDays: draft.retentionDays as number };
  }

  return { mode: draft.mode };
}

