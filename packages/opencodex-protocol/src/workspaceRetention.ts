/** Project-local advisory retention policy; null disables suggestions without preventing manual removal. */
export interface OpenCodexWorkspaceRetention {
  /** Whole days since both completion and the last known activity. */
  days: number | null;
}

/** Preserves the previous inventory's default delay for projects without a saved policy. */
export const defaultWorkspaceRetentionDays = 30;
/** Bounds persisted settings to a practical whole-day retention period. */
export const maxWorkspaceRetentionDays = 3650;

/** Validates persisted or transported policy values without coercing strings or rounding fractions. */
export function isWorkspaceRetention(value: unknown): value is OpenCodexWorkspaceRetention {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const days = (value as Record<string, unknown>).days;
  return days === null || (typeof days === "number" && Number.isInteger(days)
    && days >= 1 && days <= maxWorkspaceRetentionDays);
}
