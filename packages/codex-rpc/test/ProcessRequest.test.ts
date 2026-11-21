import { describe, expect, it, vi } from "vitest";
import { readRequestContext, resolveProcessRequest } from "../src/processRequest";

describe("source process request boundary", () => {
  it("should replace only the executable and retain native argument boundaries and process options", async () => {
    const resolve = vi.fn(async () => "C:\\Git with spaces\\git.exe");
    const params = { command: ["git", "commit", "-m", "literal & $HOME"], cwd: "C:\\Project",
      processHandle: "process", streamStdin: true, timeoutMs: 1000, env: { PATH: "C:\\Tools", KEY: null } };
    const result = await resolveProcessRequest("process/spawn", params, resolve);
    expect(result).toEqual({ ...params, command: ["C:\\Git with spaces\\git.exe", "commit", "-m", "literal & $HOME"] });
    expect(params.command[0]).toBe("git");
    expect(resolve).toHaveBeenCalledWith("git", "C:\\Project", { PATH: "C:\\Tools", KEY: null });
  });

  it("should leave unrelated RPCs and unresolved commands intact", async () => {
    const resolve = vi.fn(async program => program);
    const turn = { command: ["secret turn text"], cwd: "C:\\Project" };
    expect(await resolveProcessRequest("turn/start", turn, resolve)).toBe(turn);
    expect(resolve).not.toHaveBeenCalled();
    const params = { command: ["node", "script.js"], cwd: "C:\\Project" };
    expect(await resolveProcessRequest("command/exec", params, resolve)).toBe(params);
  });

  it("should journal the RPC method and executable without scripts, arguments, stdin or environment secrets", () => {
    const context = readRequestContext("process/spawn", { command: ["powershell.exe", "-EncodedCommand", "private-script"],
      cwd: "C:\\Project", env: { API_KEY: "private-key" }, stdin: "private-input" });
    expect(context).toEqual({ method: "process/spawn", executable: "powershell.exe", cwd: "C:\\Project" });
    expect(JSON.stringify(context)).not.toContain("private-");
    expect(readRequestContext("turn/start", { input: "private-conversation" })).toEqual({ method: "turn/start" });
  });
});
