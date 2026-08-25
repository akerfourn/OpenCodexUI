/**
 * Applies centralized compatibility corrections to mapped Codex usage payloads.
 */
import type { OpenCodexUsageSnapshot } from "@open-codex-ui/opencodex-protocol";

const SPARK_MODEL_ID = "gpt-5.3-codex-spark";
const SPARK_USAGE_LIMIT_ID = "codex_bengalfox";

/**
 * Corrects known provider inconsistencies in one mapped usage notification.
 *
 * The original reference is returned when no correction applies. A new
 * snapshot is created only when a correction changes the payload.
 *
 * @param usage Mapped usage snapshot, or `null` when it could not be mapped.
 * @param activeCommitModels Commit models currently active for the source.
 * @returns The original or corrected usage snapshot.
 */
export function correctUsageLimitNotification(
  usage: OpenCodexUsageSnapshot | null,
  activeCommitModels: Array<string | null>
): OpenCodexUsageSnapshot | null {
  if (usage === null) {
    return null;
  }

  const limit = usage.limits.length === 1 ? usage.limits[0] : undefined;
  const hasActiveSparkModel = activeCommitModels.some((model) => model === SPARK_MODEL_ID);

  if (
    !hasActiveSparkModel ||
    limit === undefined ||
    limit.limitId === null ||
    limit.limitId === SPARK_USAGE_LIMIT_ID
  ) {
    return usage;
  }

  return {
    ...usage,
    limits: [
      {
        ...limit,
        limitId: SPARK_USAGE_LIMIT_ID
      }
    ]
  };
}
