import type { CachedProjectCommandRule } from "@open-codex-ui/opencodex-cache";
import type { OpenCodexProjectCommandRule } from "@open-codex-ui/opencodex-protocol";

/**
 * Maps a cached rule into the shared protocol shape.
 *
 * @param rule Cached rule.
 * @returns Protocol rule.
 */
export function toProtocolRule(rule: CachedProjectCommandRule): OpenCodexProjectCommandRule {
  return {
    id: rule.id,
    projectId: rule.projectId,
    name: rule.name,
    pattern: [...rule.pattern],
    decision: rule.decision,
    justification: rule.justification,
    matchExamples: [...rule.matchExamples],
    notMatchExamples: [...rule.notMatchExamples],
    enabled: rule.enabled,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt
  };
}

/**
 * Converts an unknown thrown value into a readable message.
 *
 * @param error Unknown error.
 * @returns Error message.
 */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
