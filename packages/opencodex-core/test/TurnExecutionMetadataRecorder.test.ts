import type { CodexNotification } from "@open-codex-ui/codex-rpc";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CollaborationService } from "../src/backend/collaboration/CollaborationService.js";
import {
  createDeferredSpawnLookup,
  createExecutionMetadata,
  createMetadataChild,
  createMetadataFixture,
  createMetadataThread,
  createMetadataTurnStarted
} from "./turnExecutionMetadata.fixture.js";

describe("turn execution metadata recorder", () => {
  afterEach(() => vi.restoreAllMocks());

  it("should use thread defaults for effective settings without inventing requested settings", () => {
    const { recorder, cache, write } = createMetadataFixture();
    cache.getOrCreate(createMetadataThread({ model: "thread-model", reasoningEffort: "medium" }));

    recorder.recordNotification(createMetadataTurnStarted(), "source-1");

    expect(write).toHaveBeenCalledWith("source-1", "thread-1", "turn-1", createExecutionMetadata({
      effectiveModel: "thread-model", effectiveReasoningEffort: "medium"
    }));
    expect(cache.getTurnExecutionMetadata("thread-1", "turn-1")).toEqual(createExecutionMetadata({
      effectiveModel: "thread-model", effectiveReasoningEffort: "medium"
    }));
  });

  it("should prefer synchronous spawn settings while preserving known requested values and service tier", () => {
    const getSpawn = vi.fn<CollaborationService["getSpawnExecutionMetadata"]>()
      .mockReturnValue({ model: "spawn-model", reasoningEffort: "high" });
    const resolveSpawn = vi.fn<CollaborationService["resolveSpawnExecutionMetadata"]>();
    const { recorder, cache, write } = createMetadataFixture({
      getSpawnExecutionMetadata: getSpawn, resolveSpawnExecutionMetadata: resolveSpawn
    });
    cache.getOrCreate({ ...createMetadataChild(), model: "thread-model", reasoningEffort: "low" });
    cache.setTurnExecutionMetadata("child-1", "turn-1", createExecutionMetadata({
      requestedModel: "requested-model", serviceTier: "fast"
    }));

    recorder.recordNotification(createMetadataTurnStarted("child-1"), "source-1");

    expect(getSpawn).toHaveBeenCalledWith("source-1", "child-1", "parent-1", "/root/reviewer");
    expect(write).toHaveBeenCalledWith("source-1", "child-1", "turn-1", createExecutionMetadata({
      requestedModel: "requested-model", effectiveModel: "spawn-model",
      requestedReasoningEffort: "high", effectiveReasoningEffort: "high", serviceTier: "fast"
    }));
    expect(resolveSpawn).not.toHaveBeenCalled();
  });

  it("should avoid repeated writes when all five metadata fields already match", () => {
    const { recorder, cache, write } = createMetadataFixture();
    cache.getOrCreate(createMetadataThread());
    const metadata = createExecutionMetadata({
      requestedModel: "requested", effectiveModel: "effective", requestedReasoningEffort: "high",
      effectiveReasoningEffort: "medium", serviceTier: "fast"
    });
    cache.setTurnExecutionMetadata("thread-1", "turn-1", metadata);

    recorder.recordNotification(createMetadataTurnStarted(), "source-1");
    recorder.recordNotification(createMetadataTurnStarted(), "source-1");

    expect(cache.getTurnExecutionMetadata("thread-1", "turn-1")).toEqual(metadata);
    expect(write).not.toHaveBeenCalled();
  });

  it("should retain an unloaded turn's metadata and associate its write with the explicit source", () => {
    const { recorder, cache, write } = createMetadataFixture();

    recorder.recordNotification(createMetadataTurnStarted("unloaded"), "source-2");

    expect(write).toHaveBeenCalledWith("source-2", "unloaded", "turn-1", createExecutionMetadata());
    expect(cache.getTurnExecutionMetadata("unloaded", "turn-1")).toEqual(createExecutionMetadata());
  });

  it.each([
    { method: "turn/started", params: { turn: { id: "turn-1" } } },
    { method: "turn/started", params: { threadId: "thread-1", turn: {} } },
    { method: "model/rerouted", params: { threadId: "thread-1", toModel: "new-model" } },
    { method: "model/rerouted", params: { threadId: "thread-1", turnId: "turn-1", toModel: "" } },
    { method: "turn/completed", params: { threadId: "thread-1", turn: { id: "turn-1" } } }
  ] satisfies CodexNotification[])("should skip metadata writes for invalid or unrelated $method notifications", (notification) => {
    const { recorder, write } = createMetadataFixture();

    recorder.recordNotification(notification, "source-1");

    expect(write).not.toHaveBeenCalled();
  });

  it("should update only the effective model on reroute and retain requested settings and service tier", () => {
    const { recorder, cache, write } = createMetadataFixture();
    const metadata = createExecutionMetadata({
      requestedModel: "requested", effectiveModel: "old", requestedReasoningEffort: "high",
      effectiveReasoningEffort: "medium", serviceTier: "fast"
    });
    cache.setTurnExecutionMetadata("thread-1", "turn-1", metadata);

    recorder.recordNotification({
      method: "model/rerouted", params: { threadId: "thread-1", turnId: "turn-1", toModel: "new" }
    }, "source-2");

    expect(write).toHaveBeenCalledWith("source-2", "thread-1", "turn-1", { ...metadata, effectiveModel: "new" });
    expect(cache.getTurnExecutionMetadata("thread-1", "turn-1")).toEqual({ ...metadata, effectiveModel: "new" });
  });

  it("should recover late spawn settings for a child with the original source, parent and agent path", async () => {
    const lookup = createDeferredSpawnLookup();
    const resolveSpawn = vi.fn<CollaborationService["resolveSpawnExecutionMetadata"]>().mockReturnValue(lookup.promise);
    const { recorder, cache, write } = createMetadataFixture({ resolveSpawnExecutionMetadata: resolveSpawn });
    cache.getOrCreate(createMetadataChild());

    recorder.recordNotification(createMetadataTurnStarted("child-1"), "source-1");
    expect(resolveSpawn).toHaveBeenCalledWith("source-1", "child-1", "parent-1", "/root/reviewer");
    expect(write).toHaveBeenCalledTimes(1);
    lookup.resolve({ model: "spawn-model", reasoningEffort: "high" });
    await lookup.promise;

    expect(write).toHaveBeenLastCalledWith("source-1", "child-1", "turn-1", createExecutionMetadata({
      requestedModel: "spawn-model", effectiveModel: "spawn-model",
      requestedReasoningEffort: "high", effectiveReasoningEffort: "high"
    }));
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("should preserve a reroute and newer reasoning settings when an earlier history lookup completes", async () => {
    const lookup = createDeferredSpawnLookup();
    const { recorder, cache, write } = createMetadataFixture({ resolveSpawnExecutionMetadata: () => lookup.promise });
    cache.getOrCreate(createMetadataChild());
    recorder.recordNotification(createMetadataTurnStarted("child-1"), "source-1");
    cache.setTurnExecutionMetadata("child-1", "turn-1", createExecutionMetadata({
      requestedReasoningEffort: "low", effectiveReasoningEffort: "medium", serviceTier: "fast"
    }));
    recorder.recordNotification({
      method: "model/rerouted", params: { threadId: "child-1", turnId: "turn-1", toModel: "rerouted" }
    }, "source-1");

    lookup.resolve({ model: "spawn-model", reasoningEffort: "high" });
    await lookup.promise;

    expect(cache.getTurnExecutionMetadata("child-1", "turn-1")).toEqual(createExecutionMetadata({
      requestedModel: "spawn-model", effectiveModel: "rerouted", requestedReasoningEffort: "low",
      effectiveReasoningEffort: "medium", serviceTier: "fast"
    }));
    expect(write).toHaveBeenCalledTimes(3);
  });

  it("should keep known effective thread defaults when late spawn settings fill requested values", async () => {
    const lookup = createDeferredSpawnLookup();
    const { recorder, cache } = createMetadataFixture({ resolveSpawnExecutionMetadata: () => lookup.promise });
    cache.getOrCreate({ ...createMetadataChild(), model: "thread-model", reasoningEffort: "medium" });
    recorder.recordNotification(createMetadataTurnStarted("child-1"), "source-1");

    lookup.resolve({ model: "spawn-model", reasoningEffort: "high" });
    await lookup.promise;

    expect(cache.getTurnExecutionMetadata("child-1", "turn-1")).toEqual(createExecutionMetadata({
      requestedModel: "spawn-model", effectiveModel: "thread-model",
      requestedReasoningEffort: "high", effectiveReasoningEffort: "medium"
    }));
  });

  it.each(["missing", "failed"] as const)("should leave immediate metadata unchanged when history is %s", async (result) => {
    const lookup = createDeferredSpawnLookup();
    const { recorder, cache, write } = createMetadataFixture({ resolveSpawnExecutionMetadata: () => lookup.promise });
    cache.getOrCreate(createMetadataChild());
    recorder.recordNotification(createMetadataTurnStarted("child-1"), "source-1");

    if (result === "missing") {
      lookup.resolve(null);
      await lookup.promise;
    } else {
      lookup.reject(new Error("History unavailable"));
      await expect(lookup.promise).rejects.toThrow("History unavailable");
    }
    await Promise.resolve();

    expect(cache.getTurnExecutionMetadata("child-1", "turn-1")).toEqual(createExecutionMetadata());
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("should skip redundant late writes and avoid history lookups for root threads", async () => {
    const lookup = createDeferredSpawnLookup();
    const resolveSpawn = vi.fn<CollaborationService["resolveSpawnExecutionMetadata"]>().mockReturnValue(lookup.promise);
    const { recorder, cache, write } = createMetadataFixture({ resolveSpawnExecutionMetadata: resolveSpawn });
    cache.getOrCreate(createMetadataChild());
    const metadata = createExecutionMetadata({
      requestedModel: "known", effectiveModel: "known",
      requestedReasoningEffort: "high", effectiveReasoningEffort: "high"
    });
    cache.setTurnExecutionMetadata("child-1", "turn-1", metadata);
    recorder.recordNotification(createMetadataTurnStarted("child-1"), "source-1");
    lookup.resolve({ model: "known", reasoningEffort: "high" });
    await lookup.promise;
    expect(write).not.toHaveBeenCalled();

    cache.getOrCreate(createMetadataThread());
    recorder.recordNotification(createMetadataTurnStarted(), "source-1");
    expect(resolveSpawn).toHaveBeenCalledTimes(1);
  });

  it("should retain each source when concurrent child lookups resolve in reverse order", async () => {
    const first = createDeferredSpawnLookup();
    const second = createDeferredSpawnLookup();
    const { recorder, cache, write } = createMetadataFixture({
      resolveSpawnExecutionMetadata: (sourceId) => {
        if (sourceId === "source-a") return first.promise;
        return second.promise;
      }
    });
    cache.getOrCreate(createMetadataChild("child-a", "source-a"));
    cache.getOrCreate(createMetadataChild("child-b", "source-b"));
    recorder.recordNotification(createMetadataTurnStarted("child-a"), "source-a");
    recorder.recordNotification(createMetadataTurnStarted("child-b"), "source-b");

    second.resolve({ model: "model-b", reasoningEffort: "low" });
    await second.promise;
    first.resolve({ model: "model-a", reasoningEffort: "high" });
    await first.promise;

    expect(write.mock.calls.slice(2)).toEqual([
      ["source-b", "child-b", "turn-1", createExecutionMetadata({
        requestedModel: "model-b", effectiveModel: "model-b",
        requestedReasoningEffort: "low", effectiveReasoningEffort: "low"
      })],
      ["source-a", "child-a", "turn-1", createExecutionMetadata({
        requestedModel: "model-a", effectiveModel: "model-a",
        requestedReasoningEffort: "high", effectiveReasoningEffort: "high"
      })]
    ]);
  });
});
