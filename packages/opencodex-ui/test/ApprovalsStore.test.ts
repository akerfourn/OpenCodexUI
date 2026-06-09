import { isObservable, observable } from "mobx";
import { describe, expect, it } from "vitest";

import type { OpenCodexApprovalDecision } from "@open-codex-ui/opencodex-protocol";

import { cloneApprovalDecision } from "../src/stores/ApprovalsStore";

describe("ApprovalsStore", () => {
  it("should clone observable exec policy decisions before transport", () => {
    const decision = observable({
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: ["git", "status"]
      }
    }) as unknown as OpenCodexApprovalDecision;

    const cloned = cloneApprovalDecision(decision);

    expect(cloned).toEqual({
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: ["git", "status"]
      }
    });
    expect(isObservable(cloned)).toBe(false);

    if (typeof cloned === "object" && "acceptWithExecpolicyAmendment" in cloned) {
      expect(isObservable(cloned.acceptWithExecpolicyAmendment.execpolicy_amendment)).toBe(false);
    }
  });

  it("should clone observable network policy decisions before transport", () => {
    const decision = observable({
      applyNetworkPolicyAmendment: {
        network_policy_amendment: {
          host: "registry.npmjs.org",
          action: "allow"
        }
      }
    }) as unknown as OpenCodexApprovalDecision;

    const cloned = cloneApprovalDecision(decision);

    expect(cloned).toEqual({
      applyNetworkPolicyAmendment: {
        network_policy_amendment: {
          host: "registry.npmjs.org",
          action: "allow"
        }
      }
    });
    expect(isObservable(cloned)).toBe(false);
  });
});
