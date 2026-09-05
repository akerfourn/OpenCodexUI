import fs from "node:fs/promises";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectCommandLog } from "../src/backend/projects/ProjectCommandLog";

vi.mock("node:fs/promises", () => ({
  default: { mkdir: vi.fn(), appendFile: vi.fn() }
}));

describe("ProjectCommandLog", () => {
  beforeEach(() => {
    vi.mocked(fs.mkdir).mockReset().mockResolvedValue(undefined);
    vi.mocked(fs.appendFile).mockReset().mockResolvedValue(undefined);
  });

  it("should preserve the log layout and serialize chunks while an earlier write is pending", async () => {
    const log = await ProjectCommandLog.create("/data", "project", "command", "run");
    let finishFirst!: () => void;
    let observeFirst!: () => void;
    const started = new Promise<void>((resolve) => { observeFirst = resolve; });
    vi.mocked(fs.appendFile).mockImplementationOnce(async () => {
      observeFirst();
      await new Promise<void>((resolve) => { finishFirst = resolve; });
    });
    const first = log.append("stdout", "first\n");
    const second = log.append("stderr", "second\n");
    await started;
    expect(fs.appendFile).toHaveBeenCalledTimes(1);
    finishFirst();
    await Promise.all([first, second]);
    expect(log.path).toBe(path.join("/data", "opencodexui-logs", "project", "command", "run.log"));
    expect(fs.appendFile).toHaveBeenNthCalledWith(2, log.path, "[stderr] second\n", "utf8");
  });

  it("should continue writing after a failed chunk without rejecting command logging", async () => {
    const log = await ProjectCommandLog.create("/data", "project", "command", "run");
    vi.mocked(fs.appendFile).mockRejectedValueOnce(new Error("Disk full"));
    await expect(log.append("stdout", "lost")).resolves.toBeUndefined();
    await expect(log.append("stdout", "retained")).resolves.toBeUndefined();
    expect(fs.appendFile).toHaveBeenLastCalledWith(log.path, "retained", "utf8");
  });

  it("should propagate directory creation failures before a command can start", async () => {
    vi.mocked(fs.mkdir).mockRejectedValueOnce(new Error("Permission denied"));
    await expect(ProjectCommandLog.create("/data", "project", "command", "run"))
      .rejects.toThrow("Permission denied");
    expect(fs.appendFile).not.toHaveBeenCalled();
  });
});
