import { execFile, spawn } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { createSourceResourceProcessFactory } from "../src/backend/sources/resources/sourceResourceProcess";
import { instanceSource } from "./sourceInstances.fixture";

vi.mock("node:child_process", async importOriginal => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return { ...original,
    spawn: vi.fn(() => { throw new Error("Default resource settings must not invoke an OS launcher."); }),
    execFile: vi.fn(() => { throw new Error("Default resource settings must not probe OS capabilities."); })
  };
});

describe("default source process launch", () => {
  it("should retain the original SDK process factory when resources have never been configured", async () => {
    const source = instanceSource("windows-source");

    const factory = await createSourceResourceProcessFactory(source);

    expect(factory).toBeUndefined();
    expect(spawn).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });

  it("should retain the original SDK process factory for explicit normal priority and unlimited CPU", async () => {
    const source = instanceSource("windows-source");
    if (source.kind !== "local") throw new Error("This fixture requires a local source.");
    source.settings.resources = { priority: "normal", cpuLimitPercent: null };

    const factory = await createSourceResourceProcessFactory(source);

    expect(factory).toBeUndefined();
    expect(spawn).not.toHaveBeenCalled();
    expect(execFile).not.toHaveBeenCalled();
  });
});
