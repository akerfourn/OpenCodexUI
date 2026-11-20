import { once } from "node:events";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getPriority, tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { posixResourceCommand } from "../src/backend/sources/resources/sourceResourceProcess";
import { quoteWindowsArgument, windowsCommandLine, windowsResourceLaunch } from "../src/backend/sources/resources/windowsResourceLauncher";

afterEach(() => { vi.unstubAllEnvs(); });

describe("source resource launchers", () => {
  it("should convert a whole-host percentage to a group quota without dividing it among children", () => {
    expect(posixResourceCommand("/path with spaces/codex", ["--profile", "literal ${HOME}", "app-server"],
      { priority: "low", cpuLimitPercent: 50 }, 8)).toEqual({ command: "systemd-run", args: [
      "--user", "--scope", "--quiet", "--collect", "--expand-environment=no", "--property=CPUWeight=25", "--property=CPUQuota=400%", "--",
      "/usr/bin/nice", "-n", "10", "/path with spaces/codex", "--profile", "literal ${HOME}", "app-server"
    ] });
  });

  it("should keep argv intact and avoid a quota wrapper when only priority is selected", () => {
    expect(posixResourceCommand("codex", ["app-server"], { priority: "idle", cpuLimitPercent: null }))
      .toEqual({ command: "/usr/bin/nice", args: ["-n", "19", "codex", "app-server"] });
    expect(posixResourceCommand("codex", ["app-server"], { priority: "normal", cpuLimitPercent: null }))
      .toEqual({ command: "codex", args: ["app-server"] });
  });

  it("should carry Windows user arguments as data separately from the trusted encoded script", () => {
    const commandLine = windowsCommandLine("C:\\Codex path\\codex.exe", ["app-server", 'a"b', "", "C:\\trailing\\"], false);
    const launch = windowsResourceLaunch(commandLine, "low", 50,
      { cwd: "C:\\Project", environment: { Path: "C:\\Tools", SystemRoot: "C:\\Windows" } });
    const payload = JSON.parse(launch.options.env!.OPENCODEX_RESOURCE_LAUNCH!);
    expect(payload).toMatchObject({ commandLine, priority: 0x4000, cpuRate: 5000,
      workingDirectory: "C:\\Project", environmentBlock: expect.any(String) });
    const script = Buffer.from(launch.args.at(-1)!, "base64").toString("utf16le");
    expect(script).not.toContain(commandLine);
    expect(launch.args.join(" ").length).toBeLessThan(32_000);
    expect(quoteWindowsArgument('a"b')).toBe('"a\\"b"');
    expect(quoteWindowsArgument("C:\\trailing\\")).toBe('"C:\\trailing\\\\"');
    expect(launch.options.windowsHide).toBe(true);
  });

  it("should support npm batch shims in paths with spaces and refuse shell expansion", () => {
    vi.stubEnv("ComSpec", "C:\\Windows\\System32\\cmd.exe");
    expect(windowsCommandLine("C:\\User space\\codex.cmd", ["app-server"], true))
      .toBe('"C:\\Windows\\System32\\cmd.exe" /d /s /c ""C:\\User space\\codex.cmd" "app-server""');
    expect(() => windowsCommandLine("codex.cmd", ["%PATH%"], true)).toThrow("Select codex.exe");
    expect(() => windowsCommandLine("codex.cmd", ['a" & whoami'], true)).toThrow("Select codex.exe");
  });

  it.skipIf(process.platform !== "linux" && process.platform !== "darwin")(
    "should inherit low priority through a real process tree while preserving JSON byte streams", async () => {
      const childScript = "process.stdout.write(JSON.stringify({priority:require('node:os').getPriority(),value:process.argv[1]}))";
      const parentScript = "const cp=require('node:child_process'); const r=cp.spawnSync(process.execPath,['-e',process.argv[1],process.argv[2]],{encoding:'utf8'});process.stdout.write(r.stdout);process.exit(r.status)";
      const launch = posixResourceCommand(process.execPath, ["-e", parentScript, childScript, "literal $HOME & spaces"],
        { priority: "low", cpuLimitPercent: null });
      const originalPriority = getPriority();
      const child = spawn(launch.command, launch.args, { stdio: ["pipe", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", data => { output += String(data); });
      const [code] = await once(child, "close");
      expect(code).toBe(0);
      expect(JSON.parse(output)).toEqual({ priority: Math.min(19, originalPriority + 10), value: "literal $HOME & spaces" });
      expect(getPriority()).toBe(originalPriority);
    }
  );

  it.skipIf(process.platform !== "win32")(
    "should forward real Windows native streams and enforce inherited job priority", async () => {
      const descendantScript = "process.stdout.write(JSON.stringify({priority:require('node:os').getPriority(),value:process.argv[1]}))";
      const script = "let input='';process.stdin.on('data',d=>{input+=d});"
        + "process.stdin.on('end',()=>{const r=require('node:child_process').spawnSync(process.execPath,"
        + "['-e',process.argv[1],input],{encoding:'utf8'});process.stdout.write(r.stdout);process.exit(r.status)});";
      const launch = windowsResourceLaunch(windowsCommandLine(process.execPath, ["-e", script, descendantScript], false), "low", 50);
      const child = spawn(launch.command, launch.args, { ...launch.options, stdio: ["pipe", "pipe", "pipe"],
        timeout: 10_000, killSignal: "SIGKILL" });
      let output = "";
      let error = "";
      child.stdout.on("data", data => { output += String(data); });
      child.stderr.on("data", data => { error += String(data); });
      child.stdin.end("hello JSON-RPC");
      const [code] = await once(child, "close");
      expect({ code, error }).toEqual({ code: 0, error: "" });
      expect(JSON.parse(output)).toEqual({ priority: 10, value: "hello JSON-RPC" });
    }, 15_000
  );

  it.skipIf(process.platform !== "win32")(
    "should preserve cwd, PATH and Unicode for command lookup despite a polluted intermediate launcher", async () => {
      const directory = fs.mkdtempSync(path.join(tmpdir(), "opencodex resource context-"));
      try {
        const toolsDirectory = path.join(directory, "tools with spaces");
        const sourceDirectory = path.join(directory, "project with spaces");
        fs.mkdirSync(toolsDirectory);
        fs.mkdirSync(sourceDirectory);
        fs.copyFileSync(process.execPath, path.join(toolsDirectory, "git.exe"));
        const environment = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
          name.toUpperCase() !== "PATH" && name.toUpperCase() !== "PSMODULEPATH"));
        const hostPath = process.env.PATH ?? "";
        const searchPath = `${toolsDirectory};${hostPath}`;
        const modulePath = path.join(directory, "PS7 modules");
        Object.assign(environment, { Path: searchPath, PSModulePath: modulePath,
          OCUI_RESOURCE_CONTEXT_VALUE: "été — 日本語 🧪", OCUI_RESOURCE_LARGE_VALUE: "x".repeat(24_000) });
        const contextScript = "process.stdout.write(JSON.stringify({cwd:process.cwd(),path:process.env.Path,"
          + "modules:process.env.PSModulePath,value:process.env.OCUI_RESOURCE_CONTEXT_VALUE,"
          + "largeValueLength:process.env.OCUI_RESOURCE_LARGE_VALUE.length,"
          + "privateTransport:Object.keys(process.env).filter(k=>k.toUpperCase().startsWith('OPENCODEX_RESOURCE_LAUNCH')).length}))";
        const script = "const r=require('node:child_process').spawnSync('git.exe',['-e',process.argv[1]],{encoding:'utf8'});"
          + "if(r.error){process.stderr.write(r.error.message);process.exit(1)}"
          + "process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status)";
        const launch = windowsResourceLaunch(windowsCommandLine(process.execPath, ["-e", script, contextScript], false),
          "low", 50, { cwd: sourceDirectory, environment });
        // Simulate the intermediate process changing search paths, cwd and other environment values.
        const intermediateEnvironment = { ...launch.options.env, Path: hostPath, OCUI_RESOURCE_CONTEXT_VALUE: "changed by launcher" };
        const child = spawn(launch.command, launch.args, { ...launch.options, cwd: tmpdir(), env: intermediateEnvironment,
          stdio: ["pipe", "pipe", "pipe"], timeout: 15_000, killSignal: "SIGKILL" });
        let output = "";
        let error = "";
        child.stdout.on("data", data => { output += String(data); });
        child.stderr.on("data", data => { error += String(data); });
        child.stdin.end();
        const [code] = await once(child, "close");
        expect({ code, error }).toEqual({ code: 0, error: "" });
        expect(JSON.parse(output)).toEqual({ cwd: sourceDirectory, path: searchPath,
          modules: modulePath, value: "été — 日本語 🧪", largeValueLength: 24_000, privateTransport: 0 });
      } finally {
        fs.rmSync(directory, { force: true, recursive: true });
      }
    }, 20_000
  );

  it.skipIf(process.platform !== "win32")(
    "should launch a real npm-style batch shim from a Windows path containing spaces", async () => {
      const directory = fs.mkdtempSync(path.join(tmpdir(), "opencodex resource-"));
      try {
        const shim = path.join(directory, "codex.cmd");
        fs.writeFileSync(shim, `@echo off\r\n"${process.execPath}" %*\r\n`);
        const launch = windowsResourceLaunch(windowsCommandLine(shim, ["--version"], true), "low", 50);
        const child = spawn(launch.command, launch.args, { ...launch.options, stdio: ["pipe", "pipe", "pipe"],
          timeout: 10_000, killSignal: "SIGKILL" });
        let output = "";
        let error = "";
        child.stdout.on("data", data => { output += String(data); });
        child.stderr.on("data", data => { error += String(data); });
        child.stdin.end();
        const [code] = await once(child, "close");
        expect({ code, error }).toEqual({ code: 0, error: "" });
        expect(output.trim()).toBe(process.version);
      } finally {
        fs.rmSync(directory, { force: true, recursive: true });
      }
    }, 15_000
  );

  it.skipIf(process.platform !== "win32")(
    "should terminate the owned job tree if its Windows launcher is forcibly stopped", async () => {
      const launch = windowsResourceLaunch(windowsCommandLine(process.execPath,
        ["-e", "process.stdout.write(String(process.pid)+'\\n');setInterval(()=>{},1000)"], false), "low", 50);
      const child = spawn(launch.command, launch.args, { ...launch.options, stdio: ["pipe", "pipe", "pipe"],
        timeout: 10_000, killSignal: "SIGKILL" });
      let error = "";
      child.stderr.on("data", data => { error += String(data); });
      try {
        const firstOutput = await Promise.race([
          once(child.stdout, "data").then(([data]) => String(data)),
          once(child, "close").then(() => { throw new Error(`Resource launcher exited before startup: ${error}`); })
        ]);
        const pid = Number(firstOutput.trim());
        expect(pid).toBeGreaterThan(0);
        const exited = once(child, "close");
        child.kill("SIGKILL");
        await exited;
        expect(() => process.kill(pid, 0)).toThrow();
      } finally {
        child.kill("SIGKILL");
      }
    }, 15_000
  );
});
