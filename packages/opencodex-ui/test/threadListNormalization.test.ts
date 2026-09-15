import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";
import { describe, expect, it } from "vitest";

import { deduplicateThreadsById } from "../src/stores/project/threads/threadListNormalization";

describe("thread list normalization", () => {
  it("should keep the first occurrence when synchronization overlaps", () => {
    const first = createThread("thread-1", "First");
    const duplicate = createThread("thread-1", "Duplicate");
    const second = createThread("thread-2", "Second");

    expect(deduplicateThreadsById([first, duplicate, second])).toEqual([
      first,
      second
    ]);
  });
});

/** Creates the minimal runtime shape required by the identifier normalizer. */
function createThread(id: string, title: string): OpenCodexThread {
  return { id, title } as OpenCodexThread;
}
