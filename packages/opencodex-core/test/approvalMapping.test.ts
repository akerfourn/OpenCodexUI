/** Covers approval request and response mapping from Codex payloads. */
import { describe, expect, it } from "vitest";

import {
  buildApprovalResponse,
  createApprovalRequest
} from "../src/mapping";

describe("approval mapping", () => {
  it("should map approval server requests", () => {
    expect(
      createApprovalRequest({
        id: 1,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          command: "npm test",
          cwd: "/workspace",
          reason: "Run the test suite",
          availableDecisions: ["accept"]
        }
      })
    ).toMatchObject({
      id: "1",
      threadId: "thread-1",
      kind: "command",
      command: "npm test",
      cwd: "/workspace",
      reason: "Run the test suite",
      choices: ["accept", "decline"]
    });
  });

  it("should preserve structured approval decisions", () => {
    expect(
      createApprovalRequest({
        id: 2,
        method: "item/commandExecution/requestApproval",
        params: {
          threadId: "thread-1",
          command: "mkdir -p /tmp/example",
          availableDecisions: [
            {
              acceptWithExecpolicyAmendment: {
                execpolicy_amendment: ["mkdir", "-p"]
              }
            },
            {
              applyNetworkPolicyAmendment: {
                network_policy_amendment: {
                  host: "registry.npmjs.org",
                  action: "allow"
                }
              }
            },
            "cancel"
          ]
        }
      }).choices
    ).toEqual([
      {
        acceptWithExecpolicyAmendment: {
          execpolicy_amendment: ["mkdir", "-p"]
        }
      },
      {
        applyNetworkPolicyAmendment: {
          network_policy_amendment: {
            host: "registry.npmjs.org",
            action: "allow"
          }
        }
      },
      "cancel",
      "decline"
    ]);
  });

  it("should map permission approval session decisions", () => {
    const response = buildApprovalResponse(
      "item/permissions/requestApproval",
      "acceptForSession",
      {
        permissions: {
          fileSystem: {
            read: ["/workspace/docs"],
            write: null
          },
          network: null
        }
      }
    );

    expect(response).toEqual({
      permissions: {
        fileSystem: {
          read: ["/workspace/docs"],
          write: null
        },
        network: null
      },
      scope: "session"
    });
  });
});
