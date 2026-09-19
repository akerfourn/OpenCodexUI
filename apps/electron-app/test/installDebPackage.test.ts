import { beforeEach, describe, expect, it, vi } from "vitest";
import { installDebPackage } from "../src/main/installDebPackage.js";

const execute = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({
  execFile: Object.assign(vi.fn(), { [Symbol.for("nodejs.util.promisify.custom")]: execute })
}));

describe("Debian installation command", () => {
  beforeEach(() => { execute.mockReset(); });

  it("should pass the package filename literally to pkexec without a shell interpolation", async () => {
    const missing = Object.assign(new Error("not found"), { code: 1 });
    execute.mockRejectedValueOnce(missing).mockRejectedValueOnce(missing);
    execute.mockResolvedValueOnce({ stdout: "/usr/bin/pkexec\n" });
    execute.mockResolvedValueOnce({ stdout: "" });
    const file = "/cache/user's update $(example).deb";
    await installDebPackage(file, "OpenCodexUI");
    expect(execute).toHaveBeenLastCalledWith("/usr/bin/pkexec", [
      "--disable-internal-agent", "/bin/bash", "-c", 'dpkg -i "$1" || apt-get install -f -y',
      "opencodex-update", file
    ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  });

  it("should quote filenames for legacy helpers that receive a command string", async () => {
    execute.mockResolvedValueOnce({ stdout: "/usr/bin/gksudo\n" });
    execute.mockResolvedValueOnce({ stdout: "" });
    await installDebPackage("/cache/user's update.deb", "OpenCodexUI");
    expect(execute.mock.calls[1]?.[1]).toEqual([
      "--message", "OpenCodexUI would like to update",
      "'/bin/bash' '-c' 'dpkg -i \"$1\" || apt-get install -f -y' 'opencodex-update' '/cache/user'\\''s update.deb'"
    ]);
  });

  it("should report a missing privilege helper without running an installer", async () => {
    execute.mockRejectedValue(Object.assign(new Error("not found"), { code: 1 }));
    await expect(installDebPackage("/cache/update.deb", "OpenCodexUI")).rejects.toThrow("No supported privilege helper");
    expect(execute.mock.calls.map((call) => call[0])).toEqual(["which", "which", "which", "which"]);
  });

  it("should propagate privilege denial instead of reporting successful installation", async () => {
    execute.mockResolvedValueOnce({ stdout: "/usr/bin/gksudo\n" });
    execute.mockRejectedValueOnce(new Error("Authorization cancelled"));
    await expect(installDebPackage("/cache/update.deb", "OpenCodexUI")).rejects.toThrow("Authorization cancelled");
  });
});
