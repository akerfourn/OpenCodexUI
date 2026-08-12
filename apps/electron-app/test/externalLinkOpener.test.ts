import { fileURLToPath } from "node:url";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(),
  spawn: vi.fn(),
  unref: vi.fn()
}));

vi.mock("electron", () => ({
  shell: {
    openExternal: mocks.openExternal
  }
}));

vi.mock("node:child_process", () => ({
  spawn: mocks.spawn
}));

import { openExternalLink } from "../src/main/externalLinkOpener.js";
import {
  readLocation,
  resolveOpenTarget,
  splitCommandLine,
  substituteOpenCommandPlaceholder
} from "../src/main/externalOpenTarget.js";

describe("external open target helpers", () => {
  it("should_read_path_locations_without_losing_windows_text", () => {
    const cases = [
      ["src/app.ts", { path: "src/app.ts", line: null, column: null }],
      ["src/app.ts:12", { path: "src/app.ts", line: "12", column: null }],
      ["src/app.ts:12:7", { path: "src/app.ts", line: "12", column: "7" }],
      ["src/app.ts#L12", { path: "src/app.ts", line: "12", column: null }],
      ["src/app.ts#l12-L19", { path: "src/app.ts", line: "12", column: null }],
      [
        "C:\\Users\\alice\\app.ts:12:7",
        { path: "C:\\Users\\alice\\app.ts", line: "12", column: "7" }
      ]
    ] as const;

    for (const [value, expected] of cases) {
      expect(readLocation(value)).toEqual(expected);
    }
  });

  it("should_resolve_urls_and_filesystem_targets_with_locations", () => {
    expect(resolveOpenTarget("https://example.com/docs", "/workspace/project")).toEqual({
      type: "url",
      value: "https://example.com/docs"
    });
    expect(resolveOpenTarget("mailto:user@example.com", "/workspace/project")).toEqual({
      type: "url",
      value: "mailto:user@example.com"
    });

    const fileUrl = "file:///tmp/notes%20draft.ts#L12-L19";
    expect(resolveOpenTarget(fileUrl, "/workspace/project")).toEqual({
      type: "path",
      value: fileURLToPath(new URL(fileUrl)),
      line: null,
      column: null
    });

    expect(resolveOpenTarget("/tmp/app.ts:18:4", "/workspace/project")).toEqual({
      type: "path",
      value: "/tmp/app.ts",
      line: "18",
      column: "4"
    });
    expect(resolveOpenTarget("src/app.ts:7:2", "/workspace/project")).toEqual({
      type: "path",
      value: path.resolve("/workspace/project", "src/app.ts"),
      line: "7",
      column: "2"
    });
    expect(resolveOpenTarget("src/app.ts:7", null)).toEqual({
      type: "path",
      value: path.resolve(process.cwd(), "src/app.ts"),
      line: "7",
      column: null
    });
  });

  it("should_keep_a_windows_drive_prefix_as_the_current_url_scheme", () => {
    const windowsPath = "C:\\Users\\alice\\app.ts";

    expect(resolveOpenTarget(windowsPath, "/workspace/project")).toEqual({
      type: "url",
      value: windowsPath
    });
  });

  it("should_split_command_lines_using_literal_spaces_and_quotes", () => {
    const cases = [
      ["editor --reuse-window file.ts", ["editor", "--reuse-window", "file.ts"]],
      ["editor 'file with spaces.ts' \"another file.ts\"", [
        "editor",
        "file with spaces.ts",
        "another file.ts"
      ]],
      ["  editor   file.ts  ", ["editor", "file.ts"]],
      ["editor pre\"fix\"post 'x'y", ["editor", "prefixpost", "xy"]],
      ["editor \"unfinished argument", ["editor", "unfinished argument"]],
      ["editor\tfile.ts", ["editor\tfile.ts"]],
      ["editor \"\" '' file.ts", ["editor", "file.ts"]],
      ["editor file.ts && echo done | cat", ["editor", "file.ts", "&&", "echo", "done", "|", "cat"]]
    ] as const;

    for (const [value, expected] of cases) {
      expect(splitCommandLine(value)).toEqual(expected);
    }
  });

  it("should_substitute_all_placeholders_repeated_values_nulls_and_unknowns", () => {
    const context = {
      projectPath: "/workspace/project",
      filePath: "/workspace/project/src/app.ts",
      relativePath: "src/app.ts",
      line: "12",
      column: "7"
    };

    expect(substituteOpenCommandPlaceholder(
      "%D/%D|%F%F|%R|%L|%C|%X",
      context
    )).toBe(
      "/workspace/project//workspace/project|/workspace/project/src/app.ts" +
      "/workspace/project/src/app.ts|src/app.ts|12|7|%X"
    );

    expect(substituteOpenCommandPlaceholder("%D|%F|%R|%L|%C|%X", {
      projectPath: null,
      filePath: "/tmp/app.ts",
      relativePath: "app.ts",
      line: null,
      column: null
    })).toBe("|/tmp/app.ts|app.ts|||%X");
  });

  it("should_apply_placeholder_replacements_in_the_current_sequential_order", () => {
    expect(substituteOpenCommandPlaceholder("%D", {
      projectPath: "%F",
      filePath: "file:%R",
      relativePath: "relative:%L",
      line: "line:%C",
      column: "column"
    })).toBe("file:relative:line:column");
  });
});

describe("openExternalLink", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openExternal.mockResolvedValue(undefined);
    mocks.spawn.mockReturnValue({ unref: mocks.unref });
  });

  it("should_ignore_an_empty_link", async () => {
    await openExternalLink("  \t", "/workspace/project", "editor %F");

    expect(mocks.openExternal).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("should_open_urls_with_electron_shell", async () => {
    await openExternalLink("https://example.com/docs", "/workspace/project", null);

    expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/docs");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("should_ignore_a_path_without_an_opener_command", async () => {
    await openExternalLink("src/app.ts:7:2", "/workspace/project", null);

    expect(mocks.openExternal).not.toHaveBeenCalled();
    expect(mocks.spawn).not.toHaveBeenCalled();
  });

  it("should_spawn_a_path_opener_detached_and_unref_the_child", async () => {
    await openExternalLink(
      "src/app.ts:7:2",
      "/workspace/project",
      "editor --reuse-window \"%F:%L:%C\""
    );

    expect(mocks.spawn).toHaveBeenCalledWith(
      "editor",
      ["--reuse-window", `${path.resolve("/workspace/project", "src/app.ts")}:7:2`],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: false
      }
    );
    expect(mocks.unref).toHaveBeenCalledOnce();
  });

  it("should_ignore_a_blank_opener_command", async () => {
    await openExternalLink("/tmp/app.ts", "/workspace/project", "   ");

    expect(mocks.spawn).not.toHaveBeenCalled();
    expect(mocks.unref).not.toHaveBeenCalled();
  });

  it("should_propagate_shell_and_spawn_errors", async () => {
    const shellError = new Error("shell failed");
    mocks.openExternal.mockRejectedValueOnce(shellError);

    await expect(
      openExternalLink("https://example.com/docs", null, null)
    ).rejects.toBe(shellError);

    const spawnError = new Error("spawn failed");
    mocks.spawn.mockImplementationOnce(() => {
      throw spawnError;
    });

    await expect(
      openExternalLink("/tmp/app.ts", null, "editor %F")
    ).rejects.toBe(spawnError);
  });
});
