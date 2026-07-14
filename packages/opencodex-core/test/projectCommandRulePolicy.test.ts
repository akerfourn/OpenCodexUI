import { describe, expect, it } from "vitest";

import { mapPolicyCheckResult } from "../src/backend/projectCommandRulePolicy";

describe("projectCommandRulePolicy", () => {
  it("should map Codex prefix matches and decisions", () => {
    const result = mapPolicyCheckResult(["uv", "run", "pytest", "-q"], {
      exitCode: 0,
      stdout: JSON.stringify({
        matchedRules: [
          {
            prefixRuleMatch: {
              matchedPrefix: ["uv", "run", "pytest"],
              decision: "allow"
            }
          }
        ],
        decision: "allow"
      }),
      stderr: ""
    });

    expect(result).toMatchObject({
      command: ["uv", "run", "pytest", "-q"],
      decision: "allow",
      matchedRules: [
        {
          matchedPrefix: ["uv", "run", "pytest"],
          decision: "allow",
          justification: null
        }
      ],
      parseError: null
    });
  });

  it("should preserve an unmatched command without inventing a decision", () => {
    const result = mapPolicyCheckResult(["git", "status"], {
      exitCode: 0,
      stdout: JSON.stringify({ matchedRules: [] }),
      stderr: ""
    });

    expect(result.decision).toBeNull();
    expect(result.matchedRules).toEqual([]);
    expect(result.parseError).toBeNull();
  });

  it("should expose malformed checker output as a parse error", () => {
    const result = mapPolicyCheckResult(["npm", "test"], {
      exitCode: 1,
      stdout: "not json",
      stderr: "invalid rules",
    });

    expect(result.parseError).toMatch(/JSON|policy/i);
    expect(result.stderr).toBe("invalid rules");
  });
});
