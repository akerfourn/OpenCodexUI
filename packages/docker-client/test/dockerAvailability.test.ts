import { describe, expect, it, vi } from "vitest";
import { describeDockerFailure } from "../src/availability.js";
import { DockerClient } from "../src/DockerClient.js";
import { DockerCommandError } from "../src/errors.js";
import type { DockerCommandExecutor, DockerCommandResult } from "../src/command.js";

describe("Docker dependency states", () => {
  it("should identify a missing CLI without exposing process environment or output", async () => {
    const run = vi.fn(async () => { throw Object.assign(new Error("spawn docker ENOENT"), { code: "ENOENT" }); });
    const client = new DockerClient({ executor: { run } as unknown as DockerCommandExecutor });
    expect(await client.system.availability()).toMatchObject({ available: false, reason: "cli-missing",
      diagnostics: { operation: "docker-version", code: "ENOENT" } });
  });

  it.each([
    ["error during connect: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.", "engine-unreachable"],
    ["Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?", "engine-unreachable"],
    ["permission denied while trying to connect to the Docker daemon socket", "permission-denied"],
    ["docker: unknown command: docker compose", "compose-missing"],
    ["docker: 'compose' is not a docker command.", "compose-missing"],
    ["invalid project configuration", "unknown"]
  ])("should classify %s as %s without retaining command output", (stderr, reason) => {
    const result: DockerCommandResult = { exitCode: 1, signal: null, stdout: "private configuration",
      stderr: `${stderr}\nprivate-token`, stdoutTruncated: false, stderrTruncated: false };
    const error = new DockerCommandError({ command: "docker", args: ["compose", "ps"] }, result);
    const availability = describeDockerFailure(error, "compose-ps");
    expect(availability).toMatchObject({ available: false, reason, diagnostics: { operation: "compose-ps", exitCode: 1 } });
    expect(JSON.stringify(availability)).not.toContain("private-");
    expect(JSON.stringify(availability)).not.toContain("private configuration");
  });

  it("should identify a refused source spawn and check the Compose plugin without project configuration", async () => {
    const failure = describeDockerFailure(Object.assign(new Error("failed to spawn process: program not found"), { code: -32603 }), "snapshot");
    expect(failure.reason).toBe("cli-missing");
    const run = vi.fn(async () => ({ exitCode: 0, signal: null, stdout: "2.40.0\n", stderr: "",
      stdoutTruncated: false, stderrTruncated: false }));
    const client = new DockerClient({ executor: { run } as unknown as DockerCommandExecutor });
    expect(await client.system.composeVersion()).toBe("2.40.0");
    expect(run).toHaveBeenCalledWith({ command: "docker", args: ["compose", "version", "--short"], timeoutMs: 10_000 });
  });
});
