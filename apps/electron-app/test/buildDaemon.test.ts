import { EventEmitter } from "node:events";
import { join, resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRustDaemon } from "../scripts/build-daemon.mjs";

const mocks = vi.hoisted(() => ({
  cargoVersion: vi.fn(),
  spawn: vi.fn(),
  mkdir: vi.fn(),
  copyFile: vi.fn()
}));

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  return {
    execFile: Object.assign(vi.fn(), { [promisify.custom]: mocks.cargoVersion }),
    spawn: mocks.spawn
  };
});

vi.mock("node:fs/promises", () => ({ mkdir: mocks.mkdir, copyFile: mocks.copyFile }));

describe("Rust daemon build", () => {
  const cargoHome = resolve("tools", "cargo home");
  const executable = process.platform === "win32" ? "cargo.exe" : "cargo";
  const rustupCargo = join(cargoHome, "bin", executable);

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CARGO", undefined);
    vi.stubEnv("CARGO_HOME", cargoHome);
    mocks.cargoVersion.mockResolvedValue({ stdout: "host: x86_64-pc-windows-msvc\n" });
    mocks.spawn.mockImplementation(() => {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit("exit", 0, null));
      return child;
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should build with Rustup's Cargo when Cargo is missing from PATH", async () => {
    mocks.cargoVersion.mockRejectedValueOnce(Object.assign(new Error("spawn cargo ENOENT"), { code: "ENOENT" }));

    await buildRustDaemon("win32", "x64", "daemon-output");

    expect(mocks.cargoVersion.mock.calls.map(([command]) => command)).toEqual(["cargo", rustupCargo]);
    expect(mocks.spawn).toHaveBeenCalledWith(rustupCargo, expect.arrayContaining(["build"]), expect.any(Object));
  });

  it("should use the configured Cargo executable for the probe and build", async () => {
    const configuredCargo = resolve("custom-toolchain", executable);
    vi.stubEnv("CARGO", configuredCargo);

    await buildRustDaemon("win32", "x64", "daemon-output");

    expect(mocks.cargoVersion.mock.calls.map(([command]) => command)).toEqual([configuredCargo]);
    expect(mocks.spawn).toHaveBeenCalledWith(configuredCargo, expect.arrayContaining(["build"]), expect.any(Object));
  });

  it("should report how to configure Cargo when both launch attempts fail", async () => {
    mocks.cargoVersion.mockRejectedValue(Object.assign(new Error("Cargo missing"), { code: "ENOENT" }));

    await expect(buildRustDaemon("win32", "x64", "daemon-output")).rejects.toThrow("Set CARGO to Cargo's full path");

    expect(mocks.spawn).not.toHaveBeenCalled();
  });
});
