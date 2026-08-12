import type { CachedProjectCommandRule } from "@open-codex-ui/opencodex-cache";
import { describe, expect, it } from "vitest";

import { errorMessage, toProtocolRule } from "../src/backend/projectCommandRuleMapping";

describe("project command rule mapping helpers", () => {
  it("should map every cached field and isolate mutable arrays", () => {
    const rule = createRule();

    const mappedRule = toProtocolRule(rule);
    rule.pattern.push("--force");
    rule.matchExamples.push("git push --force");
    rule.notMatchExamples.push("git status");

    expect(mappedRule).toEqual({
      id: "rule-1",
      projectId: "project-1",
      name: "Allow push",
      pattern: ["git", "push"],
      decision: "allow",
      justification: "Required by release automation",
      matchExamples: ["git push origin main"],
      notMatchExamples: ["git pull"],
      enabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    });
  });

  it("should preserve Error messages", () => {
    expect(errorMessage(new Error("Unable to write rules"))).toBe("Unable to write rules");
  });

  it("should stringify non-Error thrown values", () => {
    expect(errorMessage("Unable to write rules")).toBe("Unable to write rules");
    expect(errorMessage(404)).toBe("404");
  });
});

/** Creates a cached rule with every protocol field populated. */
function createRule(): CachedProjectCommandRule {
  return {
    id: "rule-1",
    projectId: "project-1",
    name: "Allow push",
    pattern: ["git", "push"],
    decision: "allow",
    justification: "Required by release automation",
    matchExamples: ["git push origin main"],
    notMatchExamples: ["git pull"],
    enabled: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z"
  };
}
