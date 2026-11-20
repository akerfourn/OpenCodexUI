import { describe, expect, it } from "vitest";
import { captureWindowsLaunchEnvironment, windowsResourcePayloadEnvironment } from "../src/backend/sources/resources/windowsLaunchEnvironment";
import { windowsCommandLine, windowsResourceLaunch } from "../src/backend/sources/resources/windowsResourceLauncher";

describe("Windows resource launch environment", () => {
  it("should preserve executable search paths, empty values and Unicode in a double-null-terminated block", () => {
    const environment = { SystemRoot: "C:\\Windows", Path: "C:\\Tools with spaces;C:\\Git\\cmd",
      UNICODE_VALUE: "échantillon 日本語", EMPTY: "", UNSET: undefined };
    const snapshot = captureWindowsLaunchEnvironment(environment);

    expect(snapshot.environmentBlock).toBe("EMPTY=\0Path=C:\\Tools with spaces;C:\\Git\\cmd\0"
      + "SystemRoot=C:\\Windows\0UNICODE_VALUE=échantillon 日本語\0\0");
    expect(snapshot.launcherEnvironment).toEqual({ SystemRoot: "C:\\Windows", Path: environment.Path,
      UNICODE_VALUE: environment.UNICODE_VALUE, EMPTY: "" });
  });

  it("should isolate the PowerShell 5 bridge without removing the original module path from Codex", () => {
    const environment = { Path: "C:\\Git\\cmd", PSModulePath: "C:\\PowerShell7\\Modules",
      OPENCODEX_RESOURCE_LAUNCH: "old private payload", OPENCODEX_RESOURCE_LAUNCH_0: "old chunk" };
    const snapshot = captureWindowsLaunchEnvironment(environment);

    expect(snapshot.launcherEnvironment).toEqual({ Path: environment.Path });
    expect(snapshot.environmentBlock).toContain(`PSModulePath=${environment.PSModulePath}\0`);
    expect(snapshot.environmentBlock).not.toContain("OPENCODEX_RESOURCE_LAUNCH");
    expect(environment.PSModulePath).toBe("C:\\PowerShell7\\Modules");
  });

  it("should use Node's deterministic first spelling when Windows variables differ only in case", () => {
    const snapshot = captureWindowsLaunchEnvironment({ Path: "duplicate", PATH: "original", path: "other",
      psModulePath: "PS7 modules", opencodex_resource_launch: "private" });
    expect(snapshot.launcherEnvironment).toEqual({ PATH: "original" });
    expect(snapshot.environmentBlock).toBe("PATH=original\0psModulePath=PS7 modules\0\0");
  });

  it("should freeze the source launch context before the intermediate environment can change", () => {
    const environment = { Path: "C:\\Git\\cmd", PSModulePath: "C:\\PowerShell7\\Modules", SystemRoot: "C:\\Windows" };
    const commandLine = windowsCommandLine("C:\\Codex\\codex.exe", ["app-server"], false);
    const launch = windowsResourceLaunch(commandLine, "low", 50, { cwd: "C:\\My project", environment });
    environment.Path = "changed later";
    const payload = JSON.parse(launch.options.env!.OPENCODEX_RESOURCE_LAUNCH!);

    expect(launch.options.cwd).toBe("C:\\My project");
    expect(launch.options.env).not.toHaveProperty("PSModulePath");
    expect(payload.workingDirectory).toBe("C:\\My project");
    expect(payload.environmentBlock).toContain("Path=C:\\Git\\cmd\0");
    expect(payload.environmentBlock).toContain("PSModulePath=C:\\PowerShell7\\Modules\0");
    expect(payload.environmentBlock).not.toContain("changed later");
  });

  it("should transport a large environment without exceeding the Windows variable limit or losing Unicode", () => {
    const payload = JSON.stringify({ commandLine: "codex.exe app-server", environmentBlock: "Path=C:\\Git\\cmd\0"
      + "LARGE=" + "été 日本語 🧪 ".repeat(6_000) + "\0\0" });
    const environment = windowsResourcePayloadEnvironment(payload);
    const { chunkCount } = JSON.parse(environment.OPENCODEX_RESOURCE_LAUNCH!);
    expect(chunkCount).toBeGreaterThan(1);
    const chunks: string[] = [];
    for (let index = 0; index < chunkCount; index += 1) {
      const chunk = environment[`OPENCODEX_RESOURCE_LAUNCH_${index}`]!;
      expect(chunk.length).toBeLessThanOrEqual(8_000);
      chunks.push(chunk);
    }
    expect(Buffer.from(chunks.join(""), "base64").toString("utf8")).toBe(payload);
    expect(captureWindowsLaunchEnvironment(environment).environmentBlock).toBe("\0\0");
  });
});
