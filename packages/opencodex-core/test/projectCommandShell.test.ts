import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import { describe, expect, it, vi } from "vitest";

import { resolveProjectCommandShell } from "../src/backend/projects/projectCommandShell";

/** Provides only the source-local RPC boundary; shell selection remains real. */
function fixture() {
  const request = vi.fn().mockResolvedValue({ exitCode: 0, stdout: "", stderr: "" });
  const client = { request } as unknown as Pick<CodexAppServerClient, "request">;
  return { client, request };
}

describe("project command shell selection", () => {
  it("should prefer PowerShell 7 using the source's PATH and captured working directory", async () => {
    const { client, request } = fixture();
    const command = await resolveProjectCommandShell(client, "Write-Output 'ok'", "D:\\worktree");

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith("command/exec", {
      command: ["where.exe", "/q", "$PATH:pwsh.exe"],
      cwd: "D:\\worktree", timeoutMs: 5000, outputBytesCap: 4096
    });
    expect(command[0]).toBe("pwsh.exe");
  });

  it("should fall back to Windows PowerShell only when PowerShell 7 is missing", async () => {
    const { client, request } = fixture();
    request.mockResolvedValueOnce({ exitCode: 1, stdout: "", stderr: "Not found" });
    const environment = { PATH: "C:\\Windows\\System32;C:\\Tools" };
    const command = await resolveProjectCommandShell(client, "$env:MODE = 'test'", "C:\\repo", environment);

    expect(command[0]).toBe("powershell.exe");
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1].env).toEqual(environment);
  });

  it("should surface a failed probe rather than guessing a shell or executing the task", async () => {
    const { client, request } = fixture();
    request.mockResolvedValueOnce({ exitCode: 2, stdout: "", stderr: "Access denied" });
    await expect(resolveProjectCommandShell(client, "npm test", "C:\\repo"))
      .rejects.toThrow("Unable to detect PowerShell on this source: Access denied");
    expect(request).toHaveBeenCalledOnce();
  });

  it("should propagate a source disconnect without falling back or retrying", async () => {
    const { client, request } = fixture();
    request.mockRejectedValueOnce(new Error("Source disconnected"));
    await expect(resolveProjectCommandShell(client, "npm test", "C:\\repo"))
      .rejects.toThrow("Source disconnected");
    expect(request).toHaveBeenCalledOnce();
  });

  it.each(["/workspace/project", "/mnt/c/project"])(
    "should keep a POSIX shell for %s without inspecting the Windows host",
    async (path) => {
      const { client, request } = fixture();
      await expect(resolveProjectCommandShell(client, "npm test", path)).resolves.toEqual(["sh", "-lc", "npm test"]);
      expect(request).not.toHaveBeenCalled();
    }
  );

  it("should reject empty commands before querying the source", async () => {
    const { client, request } = fixture();
    await expect(resolveProjectCommandShell(client, "  ", "C:\\repo")).rejects.toThrow("Command is required.");
    expect(request).not.toHaveBeenCalled();
  });
});
