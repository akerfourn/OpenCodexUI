import { describe, expect, it } from "vitest";
import { previewDebugImport } from "../src/backend/debug/debugConfigurationImport";
import { javascriptLaunchArguments } from "../src/backend/debug/javascriptConfiguration";

const context = { sourceId: "local", projectId: "project", workspaceId: "main", workspacePath: "/project" };

/** Converts one or more inline launch profiles with deterministic draft ids. */
function preview(configurations: unknown[], platform = "linux", workspacePath = "/project") {
  return previewDebugImport(JSON.stringify({ version: "0.2.0", configurations }),
    { ...context, workspacePath }, platform, "import");
}

describe("VS Code debug configuration import", () => {
  it("should accept comments and trailing commas and preserve supported Node launch fields", () => {
    const result = previewDebugImport(`{
      // A normal VS Code launch file.
      "configurations": [{
        "name": "API", "type": "pwa-node", "request": "launch",
        "program": "\u0024{workspaceFolder}/dist/server.js",
        "cwd": "\u0024{workspaceFolder}/backend", "args": ["--port", "3000"],
        "runtimeExecutable": "node", "sourceMaps": true,
      }],
    }`, context, "linux", "import");
    expect(result.issues).toEqual([]);
    expect(result.entries[0]).toMatchObject({
      issues: [], configuration: {
        id: "import:0", name: "API", target: "node", request: "launch",
        program: "/project/dist/server.js", cwd: "/project/backend",
        args: ["--port", "3000"], runtime: "node", context
      }
    });
    expect(javascriptLaunchArguments(result.entries[0]!.configuration!, "/profile")).toMatchObject({
      program: "/project/dist/server.js", cwd: "/project/backend", args: ["--port", "3000"]
    });
  });

  it("should map Chrome runtime arguments separately from Node program arguments", () => {
    const result = preview([{ name: "Web", type: "chrome", request: "launch",
      url: "http://localhost:5173", webRoot: "${workspaceFolder}/src",
      runtimeArgs: ["--disable-extensions"] }]);
    expect(result.entries[0]).toMatchObject({ issues: [], configuration: {
      target: "chrome", url: "http://localhost:5173", webRoot: "/project/src",
      args: ["--disable-extensions"]
    } });
  });

  it("should apply only the current platform override without changing input data", () => {
    const original = { name: "Node", type: "node", request: "launch", program: "default.js",
      windows: { program: "${workspaceFolder}${pathSeparator}windows.js", args: ["${workspaceFolderBasename}"] },
      linux: { program: "linux.js" } };
    const result = preview([original], "win32", "C:\\projects\\app");
    expect(result.entries[0]?.configuration).toMatchObject({
      program: "C:\\projects\\app\\windows.js", args: ["app"]
    });
    expect(original.program).toBe("default.js");
  });

  it("should report every dropped option and unresolved variable rather than execute substitutions", () => {
    const result = preview([{ name: "Node", type: "node", request: "launch",
      program: "${file}", args: ["--flag", "${command:pickValue}"],
      env: { TOKEN: "not-expanded" }, envFile: ".env", runtimeArgs: ["--loader", "example"],
      preLaunchTask: "build", outFiles: ["dist/**"], skipFiles: ["<node_internals>/**"] }]);
    expect(result.entries[0]?.configuration).toMatchObject({ name: "Node", args: undefined });
    expect(result.entries[0]?.configuration?.program).toBeUndefined();
    expect(result.entries[0]?.issues).toEqual(expect.arrayContaining([
      { kind: "variable", field: "program: ${file}" },
      { kind: "variable", field: "args: ${command:pickValue}" },
      ...["env", "envFile", "runtimeArgs", "preLaunchTask", "outFiles", "skipFiles"]
        .map(field => ({ kind: "ignored", field }))
    ]));
  });

  it("should retain valid profiles alongside unsupported debuggers and compound warnings", () => {
    const result = previewDebugImport(JSON.stringify({ configurations: [
      { name: "Python", type: "debugpy", request: "launch" },
      { name: "Node", type: "node", request: "attach", port: 9230 }
    ], compounds: [{ name: "All", configurations: ["Python", "Node"] }] }), context, "linux", "import");
    expect(result.entries[0]?.configuration).toBeNull();
    expect(result.entries[1]?.configuration).toMatchObject({ request: "attach", port: 9230 });
    expect(result.issues).toEqual([{ kind: "ignored", field: "compounds" }]);
  });

  it.each([
    { address: "remote.example" }, { processId: "${command:PickProcess}" },
    { browserURL: "http://remote.example:9222" }, { websocketAddress: "ws://example" }
  ])("should not silently replace an explicit attach target with a local default: %j", (fields) => {
    expect(preview([{ name: "Attach", type: "node", request: "attach", ...fields }])
      .entries[0]?.configuration).toBeNull();
  });

  it("should flag invalid values, including missing browser target filters", () => {
    const result = preview([{ name: "Attach", type: "pwa-chrome", request: "attach", port: "${env:PORT}" }]);
    expect(result.entries[0]?.issues).toEqual(expect.arrayContaining([
      { kind: "invalid", field: "port" }, { kind: "invalid", field: "urlFilter" }
    ]));
    expect(result.entries[0]?.configuration?.port).toBeUndefined();
  });

  it("should keep imported profiles attached to the workspace used for the preview", () => {
    const config = [{ name: "Node", type: "node", request: "launch", program: "${workspaceFolder}/main.js" }];
    const first = preview(config);
    const second = previewDebugImport(JSON.stringify({ configurations: config }), {
      ...context, workspaceId: "other", workspacePath: "/other"
    }, "linux", "other-import");
    expect(first.entries[0]?.configuration?.context).toEqual(context);
    expect(second.entries[0]?.configuration?.program).toBe("/other/main.js");
    expect(second.entries[0]?.configuration?.id).not.toBe(first.entries[0]?.configuration?.id);
  });

  it("should reject malformed or oversized files and excessive configuration lists", () => {
    expect(() => previewDebugImport("{", context, "linux", "id")).toThrow(SyntaxError);
    expect(() => previewDebugImport("{}", context, "linux", "id")).toThrow("configurations array");
    expect(() => previewDebugImport(" ".repeat(512 * 1024 + 1), context, "linux", "id")).toThrow("512 KiB");
    expect(() => preview(Array(101).fill({}))).toThrow("At most 100");
  });
});
