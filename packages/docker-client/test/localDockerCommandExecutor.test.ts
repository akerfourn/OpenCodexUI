import { describe, expect, it } from "vitest";

import { LocalDockerCommandExecutor } from "../src/localDockerCommandExecutor.js";

describe("LocalDockerCommandExecutor", () => {
  it("should execute commands without a shell and preserve argument boundaries", async () => {
    const executor = new LocalDockerCommandExecutor();

    const result = await executor.run({
      command: process.execPath,
      args: ["-e", "process.stdout.write(process.argv[1])", "value with spaces"],
      timeoutMs: 5_000
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("value with spaces");
    expect(result.stderr).toBe("");
  });

  it("should stream both output channels and retain bounded completion output", async () => {
    const executor = new LocalDockerCommandExecutor();
    const stdout: string[] = [];
    const stderr: string[] = [];

    const handle = executor.stream({
      command: process.execPath,
      args: ["-e", "process.stdout.write('abcdef'); process.stderr.write('warning')"],
      outputBytesCap: 4,
      timeoutMs: 5_000
    }, {
      onStdout: (chunk) => stdout.push(chunk),
      onStderr: (chunk) => stderr.push(chunk)
    });
    const result = await handle.completion;

    expect(stdout.join("")).toBe("abcdef");
    expect(stderr.join("")).toBe("warning");
    expect(result.stdout).toBe("abcd");
    expect(result.stderr).toBe("warn");
    expect(result.stdoutTruncated).toBe(true);
    expect(result.stderrTruncated).toBe(true);
  });

  it("should fail bounded commands that exceed their timeout", async () => {
    const executor = new LocalDockerCommandExecutor();

    await expect(executor.run({
      command: process.execPath,
      args: ["-e", "setInterval(() => undefined, 1000)"],
      timeoutMs: 20
    })).rejects.toThrow("timed out");
  });
});
