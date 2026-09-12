import { describe, expect, it } from "vitest";

import {
  createLogPolicyDraft,
  toOpenCodexLogPolicies,
  validateLogPolicyDraft
} from "../src/components/home/homeLogPolicyDraft";

describe("log policy draft", () => {
  it("should reject empty and out-of-range numeric values", () => {
    const draft = createLogPolicyDraft({
      info: { mode: "session", maxEntries: 200 },
      performanceSlowdown: { mode: "retained", retentionDays: 7 }
    });
    draft.info.maxEntries = "";
    draft.performanceSlowdown.retentionDays = 3_651;

    expect(validateLogPolicyDraft(draft)).toEqual({
      info: { maxEntries: "invalid" },
      performanceSlowdown: { retentionDays: "invalid" }
    });
    expect(toOpenCodexLogPolicies(draft)).toBeNull();
  });

  it("should build only the selected policy union fields after valid edits", () => {
    const draft = createLogPolicyDraft({
      info: { mode: "disabled" },
      performanceSlowdown: { mode: "unlimited" }
    });
    draft.info.mode = "session";
    draft.info.maxEntries = 1;
    draft.performanceSlowdown.mode = "retained";
    draft.performanceSlowdown.retentionDays = 3_650;

    expect(toOpenCodexLogPolicies(draft)).toEqual({
      info: { mode: "session", maxEntries: 1 },
      performanceSlowdown: { mode: "retained", retentionDays: 3_650 }
    });
  });
});

