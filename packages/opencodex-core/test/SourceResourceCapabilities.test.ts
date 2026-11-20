import { describe, expect, it, vi } from "vitest";
import { detectSourceResourceCapabilities, requireSourceResourceSupport } from "../src/backend/sources/resources/resourceCapabilities";

describe("source resource capabilities", () => {
  it("should require a working quota probe rather than infer support from the Linux host name", async () => {
    const probe = vi.fn(async (command: string) => {
      if (command === "systemd-run") throw new Error("No user bus");
    });
    expect(await detectSourceResourceCapabilities("linux", probe)).toEqual({
      priority: true, cpuLimit: false, cpuLimitUnavailableReason: "systemdUnavailable"
    });
    expect(probe.mock.calls.map(([command]) => command)).toEqual(["/usr/bin/nice", "systemd-run"]);
  });

  it("should verify the cgroup quota with variable expansion disabled and Electron in Node mode", async () => {
    const probe = vi.fn(async (_command: string, _args: string[], _env?: NodeJS.ProcessEnv) => undefined);
    expect(await detectSourceResourceCapabilities("linux", probe)).toEqual({
      priority: true, cpuLimit: true, cpuLimitUnavailableReason: null
    });
    const [, args, env] = probe.mock.calls[1]!;
    expect(args).toContain("--expand-environment=no");
    expect(args).toContain("--property=CPUQuota=100%");
    expect(args.at(-1)).toContain("cpu.max");
    expect(env?.ELECTRON_RUN_AS_NODE).toBe("1");
  });

  it("should detect inherited priority without offering an unimplemented macOS CPU cap", async () => {
    const probe = vi.fn(async () => undefined);
    expect(await detectSourceResourceCapabilities("darwin", probe)).toEqual({
      priority: true, cpuLimit: false, cpuLimitUnavailableReason: "platformUnsupported"
    });
    expect(probe).toHaveBeenCalledOnce();
  });

  it("should expose Windows controls only after the native job bridge succeeds", async () => {
    const probe = vi.fn(async () => undefined);
    expect(await detectSourceResourceCapabilities("win32", probe)).toMatchObject({ priority: true, cpuLimit: true });
    probe.mockRejectedValueOnce(new Error("Constrained language mode"));
    expect(await detectSourceResourceCapabilities("win32", probe)).toEqual({
      priority: false, cpuLimit: false, cpuLimitUnavailableReason: "windowsUnavailable"
    });
  });

  it("should avoid host commands for unsupported systems", async () => {
    const probe = vi.fn();
    expect(await detectSourceResourceCapabilities("freebsd", probe)).toMatchObject({ priority: false, cpuLimit: false });
    expect(probe).not.toHaveBeenCalled();
  });

  it("should reject malformed limits and nonlocal sources before any OS discovery", async () => {
    await expect(requireSourceResourceSupport("ssh", { priority: "normal", cpuLimitPercent: null }))
      .rejects.toThrow("only for local sources");
    await expect(requireSourceResourceSupport("local", { priority: "low", cpuLimitPercent: 101 }))
      .rejects.toThrow("between 1 and 100");
    await expect(requireSourceResourceSupport("local", { priority: "normal", cpuLimitPercent: null }))
      .resolves.toBeUndefined();
  });
});
