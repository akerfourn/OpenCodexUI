import { describe, expect, it } from "vitest";

import {
  hashProjectCommandRules,
  renderProjectCommandRules,
  tokenizeCommandLine
} from "../src/backend/projects/projectCommandRuleGenerator";
import type { OpenCodexProjectCommandRule } from "@open-codex-ui/opencodex-protocol";

const enabledRule: OpenCodexProjectCommandRule = {
  id: "rule-1",
  projectId: "project-1",
  name: "Project tests",
  pattern: ["uv", "run", "pytest"],
  decision: "allow",
  justification: "Project tests are safe.",
  matchExamples: ["uv run pytest tests -q"],
  notMatchExamples: ["uv run"],
  enabled: true,
  createdAt: "2026-07-13T00:00:00.000Z",
  updatedAt: "2026-07-13T00:00:00.000Z"
};

describe("projectCommandRuleGenerator", () => {
  it("should render deterministic managed rule source", () => {
    const disabledRule = { ...enabledRule, id: "rule-2", name: "Disabled", enabled: false };
    const content = renderProjectCommandRules([enabledRule, disabledRule]);

    expect(content).toContain("# This file is managed by OpenCodexUI.");
    expect(content).toContain("pattern = [\"uv\", \"run\", \"pytest\"]");
    expect(content).toContain("decision = \"allow\"");
    expect(content).toContain("not_match = [\"uv run\"]");
    expect(content).not.toContain("# OpenCodexUI rule: Disabled");
    expect(content.endsWith("\n")).toBe(true);
    expect(hashProjectCommandRules(content)).toBe(hashProjectCommandRules(content));
  });

  it("should tokenize quoted command arguments without invoking a shell", () => {
    expect(tokenizeCommandLine("uv run pytest \"tests/unit tests\" -q")).toEqual([
      "uv",
      "run",
      "pytest",
      "tests/unit tests",
      "-q"
    ]);
  });

  it("should reject unterminated command quotes", () => {
    expect(() => tokenizeCommandLine("uv run pytest 'tests")).toThrow(/unterminated/i);
  });
});
