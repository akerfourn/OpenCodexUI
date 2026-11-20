import { describe, expect, it, vi } from "vitest";
import { SourceResourcesService } from "../src/backend/sources/SourceResourcesService";
import { instanceSource } from "./sourceInstances.fixture";

vi.mock("../src/backend/sources/resources/resourceCapabilities", () => ({
  readSourceResourceCapabilities: vi.fn(async () => ({ priority: true, cpuLimit: true, cpuLimitUnavailableReason: null }))
}));

describe("source resource settings read", () => {
  it("should read explicit source defaults without a Codex connection and return cloneable values", async () => {
    const resolveRequestedSource = vi.fn(async () => instanceSource("a"));
    const service = new SourceResourcesService({ resolveRequestedSource });
    const snapshot = await service.read("a");
    expect(resolveRequestedSource).toHaveBeenCalledWith("a");
    expect(snapshot).toEqual({ settings: { priority: "normal", cpuLimitPercent: null },
      capabilities: { priority: true, cpuLimit: true, cpuLimitUnavailableReason: null } });
    expect(structuredClone(snapshot)).toEqual(snapshot);
  });

  it("should reject missing source ids and fallback resolution to a different source", async () => {
    const resolveRequestedSource = vi.fn(async () => instanceSource("a"));
    const service = new SourceResourcesService({ resolveRequestedSource });
    await expect(service.read("")).rejects.toThrow("explicit Codex source");
    expect(resolveRequestedSource).not.toHaveBeenCalled();
    await expect(service.read("b")).rejects.toThrow("only for local sources");
  });
});
