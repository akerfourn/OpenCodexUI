/**
 * Covers backend error classification helpers.
 */
import { JsonRpcError } from "@open-codex-ui/codex-rpc";
import { describe, expect, it } from "vitest";

import {
  isMissingRolloutError,
  isUnmaterializedThreadError
} from "../src/backend/errors";

describe("backend error classification", () => {
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
