/**
 * Maps Codex exec-policy checker responses into protocol data.
 */
import type { v2 } from "@open-codex-ui/codex-rpc";
import type {
  OpenCodexCommandRuleDecision,
  OpenCodexProjectCommandRuleMatch,
  OpenCodexProjectCommandRuleTestResult
} from "@open-codex-ui/opencodex-protocol";

/**
 * Maps the Codex policy checker response into the UI result shape.
 *
 * @param command Parsed command tokens.
 * @param response Raw command execution response.
 * @returns Structured policy test result.
 */
export function mapPolicyCheckResult(
  command: string[],
  response: v2.CommandExecResponse
): OpenCodexProjectCommandRuleTestResult {
  let decision: OpenCodexCommandRuleDecision | null = null;
  let matchedRules: OpenCodexProjectCommandRuleMatch[] = [];
  let parseError: string | null = null;

  try {
    const parsed = JSON.parse(response.stdout) as unknown;

    if (!isRecord(parsed)) {
      throw new Error("Codex returned an invalid policy result.");
    }

    decision = readDecision(parsed.decision);
    matchedRules = readMatchedRules(parsed.matchedRules);
  } catch (error) {
    parseError = errorMessage(error);
  }

  return {
    command,
    decision,
    matchedRules,
    stdout: response.stdout,
    stderr: response.stderr,
    exitCode: response.exitCode,
    parseError
  };
}

/**
 * Reads a decision value from an untyped Codex response.
 *
 * @param value Candidate value.
 * @returns Valid decision, or `null`.
 */
function readDecision(value: unknown): OpenCodexCommandRuleDecision | null {
  return value === "allow" || value === "prompt" || value === "forbidden" ? value : null;
}

/**
 * Reads matched prefix rules from an untyped Codex response.
 *
 * @param value Candidate matched-rule list.
 * @returns Normalized matched rules.
 */
function readMatchedRules(value: unknown): OpenCodexProjectCommandRuleMatch[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const matches: OpenCodexProjectCommandRuleMatch[] = [];

  for (const candidate of value) {
    if (!isRecord(candidate) || !isRecord(candidate.prefixRuleMatch)) {
      continue;
    }

    const matchedPrefix = readStringArray(candidate.prefixRuleMatch.matchedPrefix);
    const decision = readDecision(candidate.prefixRuleMatch.decision);

    if (matchedPrefix.length === 0 || decision === null) {
      continue;
    }

    matches.push({
      matchedPrefix,
      decision,
      justification: typeof candidate.prefixRuleMatch.justification === "string"
        ? candidate.prefixRuleMatch.justification
        : null
    });
  }

  return matches;
}

/**
 * Checks whether an unknown value is a record.
 *
 * @param value Unknown value.
 * @returns Whether the value is a non-array object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a string array from an untyped response.
 *
 * @param value Candidate array.
 * @returns String values.
 */
function readStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : [];
}

/**
 * Converts an unknown thrown value into a readable message.
 *
 * @param error Unknown error.
 * @returns Error message.
 */
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
