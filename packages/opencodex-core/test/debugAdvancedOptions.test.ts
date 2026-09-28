import { describe, expect, it } from "vitest";
import { parseDebugAdvancedOptions, type DebugConfiguration } from "@open-codex-ui/opencodex-protocol";
import { resolveDebugAdvancedOptions } from "../src/backend/debug/debugAdvancedOptions";
import { javascriptLaunchArguments, validateDebugConfiguration } from "../src/backend/debug/javascriptConfiguration";
import { previewDebugImport } from "../src/backend/debug/debugConfigurationImport";

const context = { sourceId: "local", projectId: "project", workspaceId: "main", workspacePath: "/project" };
const config: DebugConfiguration = { id: "node", name: "Node", adapter: "javascript", context,
  target: "node", request: "launch", program: "main.js" };

describe("advanced debug configuration", () => {
  it("should preserve existing launch defaults when advanced options are absent", () => {
    expect(javascriptLaunchArguments(config, "/profile")).toMatchObject({
      sourceMaps: true, stopOnEntry: false, autoAttachChildProcesses: false,
      env: { ELECTRON_RUN_AS_NODE: null }, console: "internalConsole"
    });
  });

  it("should pass validated runtime, environment and stepping options without changing ownership settings", () => {
    const advanced = { env: { MODE: "test", REMOVE: null }, runtimeArgs: ["--enable-source-maps"],
      envFile: ".env", stopOnEntry: true, sourceMaps: false, smartStep: false,
      skipFiles: ["<node_internals>/**"], outFiles: ["${workspaceFolder}/build/**/*.js"],
      sourceMapPathOverrides: { "webpack:///./*": "${workspaceFolder}/*" } };
    const result = javascriptLaunchArguments({ ...config, advanced }, "/profile", true);
    expect(result).toMatchObject({ ...advanced, envFile: "/project/.env",
      env: { ...advanced.env, ELECTRON_RUN_AS_NODE: null },
      outFiles: ["/project/build/**/*.js"], sourceMapPathOverrides: { "webpack:///./*": "/project/*" },
      runtimeSourcemapPausePatterns: [], autoAttachChildProcesses: false, console: "internalConsole"
    });
    expect(advanced.envFile).toBe(".env");
    expect(advanced.outFiles).toEqual(["${workspaceFolder}/build/**/*.js"]);
  });

  it.each(["console", "autoAttachChildProcesses", "__pendingTargetId", "userDataDir", "preLaunchTask"])(
    "should reject unsupported advanced option %s before a launch or save", field => {
      expect(() => validateDebugConfiguration({ ...config, advanced: { [field]: true } }))
        .toThrow(`Unsupported advanced option: ${field}`);
    }
  );

  it("should reject malformed option values and unknown variables without exposing environment values", () => {
    expect(() => parseDebugAdvancedOptions({ sourceMaps: "false" }, "node", "launch")).toThrow("boolean");
    expect(() => parseDebugAdvancedOptions({ env: { KEY: 42 } }, "node", "launch")).toThrow("Invalid entry in env");
    expect(() => parseDebugAdvancedOptions({ env: { ELECTRON_RUN_AS_NODE: "1" } }, "node", "launch"))
      .toThrow("managed by OpenCodexUI");
    expect(() => resolveDebugAdvancedOptions({ ...config, advanced: { env: { KEY: "private-${env:SECRET}" } } }))
      .toThrow("Unresolved variable in advanced option: env");
    expect(() => parseDebugAdvancedOptions({ runtimeArgs: [null] }, "node", "launch")).toThrow("array of strings");
    expect(() => parseDebugAdvancedOptions({ envFile: "" }, "node", "launch")).toThrow("non-empty string");
  });

  it("should support common options in Chrome and attach mode but reject Node launch-only fields", () => {
    expect(parseDebugAdvancedOptions({ skipFiles: ["**/vendor/**"] }, "chrome", "attach"))
      .toEqual({ skipFiles: ["**/vendor/**"] });
    expect(() => parseDebugAdvancedOptions({ envFile: ".env" }, "node", "attach")).toThrow("only available");
    expect(() => parseDebugAdvancedOptions({ runtimeArgs: [] }, "chrome", "launch")).toThrow("only available");
  });

  it("should resolve Windows workspace variables without using the selected host workspace", () => {
    const result = resolveDebugAdvancedOptions({ ...config,
      context: { ...context, workspacePath: "D:\\project" },
      advanced: { envFile: "config\\.env", outFiles: ["${workspaceFolder}\\dist\\**\\*.js"],
        runtimeArgs: ["--require", "${workspaceFolder}${pathSeparator}setup.cjs"] }
    }, "win32");
    expect(result.envFile).toBe("D:\\project\\config\\.env");
    expect(result.outFiles).toEqual(["D:/project/dist/**/*.js"]);
    expect(result.runtimeArgs).toEqual(["--require", "D:\\project\\setup.cjs"]);
  });

  it("should import supported options and retain warnings for unsupported or malformed fields", () => {
    const preview = previewDebugImport(JSON.stringify({ configurations: [{
      name: "API", type: "node", request: "launch", program: "main.js",
      env: { MODE: "test", REMOVE: null }, envFile: ".env", runtimeArgs: ["--enable-source-maps"],
      stopOnEntry: true, skipFiles: ["<node_internals>/**"], sourceMaps: false,
      outFiles: ["${workspaceFolder}/dist/**/*.js"], smartStep: "invalid",
      console: "integratedTerminal", preLaunchTask: "build", autoAttachChildProcesses: true
    }] }), context, "linux", "import");
    expect(preview.entries[0]?.configuration?.advanced).toEqual({
      env: { MODE: "test", REMOVE: null }, envFile: "/project/.env", runtimeArgs: ["--enable-source-maps"],
      stopOnEntry: true, skipFiles: ["<node_internals>/**"], sourceMaps: false, outFiles: ["/project/dist/**/*.js"]
    });
    expect(preview.entries[0]?.issues).toEqual(expect.arrayContaining([
      { kind: "invalid", field: "smartStep" }, { kind: "ignored", field: "console" },
      { kind: "ignored", field: "preLaunchTask" }, { kind: "ignored", field: "autoAttachChildProcesses" }
    ]));
  });

  it("should keep browser arguments separate and drop incomplete environment maps during import", () => {
    const preview = previewDebugImport(JSON.stringify({ configurations: [
      { type: "chrome", request: "launch", url: "http://localhost", runtimeArgs: ["--disable-extensions"],
        envFile: ".env", skipFiles: ["**/vendor/**"] },
      { type: "node", request: "launch", program: "main.js", env: { OK: "yes", BAD: "${command:secret}" } }
    ] }), context, "linux", "import");
    expect(preview.entries[0]?.configuration).toMatchObject({ args: ["--disable-extensions"],
      advanced: { skipFiles: ["**/vendor/**"] } });
    expect(preview.entries[0]?.issues).toContainEqual({ kind: "ignored", field: "envFile" });
    expect(preview.entries[1]?.configuration?.advanced).toBeUndefined();
    expect(preview.entries[1]?.issues).toContainEqual({ kind: "variable", field: "env" });
  });
});
