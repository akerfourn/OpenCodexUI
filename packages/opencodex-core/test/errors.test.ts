/**
 * Covers backend error classification helpers.
 */
import { JsonRpcError } from "@open-codex-ui/codex-rpc";
import { describe, expect, it } from "vitest";

import {
  isMissingRolloutError,
  normalizeError,
  isUnmaterializedThreadError
} from "../src/backend/shared/errors";

describe("backend error classification", () => {
  it("should retain executable diagnostics even when Codex returns no error data", () => {
    const error = new JsonRpcError("failed to spawn process: program not found", -32603, undefined,
      { method: "process/spawn", executable: "git", cwd: "C:\\Project" });
    expect(normalizeError(error)).toEqual({
      message: "Codex app-server a refusé la requête [git]: failed to spawn process: program not found",
      details: { method: "process/spawn", executable: "git", cwd: "C:\\Project", code: -32603,
        message: "failed to spawn process: program not found", data: null }
    });
  });
  it("should identify unmaterialized thread turn-list errors", () => {
    const error = new JsonRpcError(
      "thread 019e6066 is not materialized yet; " +
        "thread/turns/list is unavailable before first user message"
    );

    expect(isUnmaterializedThreadError(error)).toBe(true);
    expect(isMissingRolloutError(error)).toBe(false);
  });

  it("should not treat unrelated RPC errors as unmaterialized threads", () => {
    const error = new JsonRpcError("no rollout found for thread id 019e6066");

    expect(isUnmaterializedThreadError(error)).toBe(false);
    expect(isMissingRolloutError(error)).toBe(true);
  });
});
