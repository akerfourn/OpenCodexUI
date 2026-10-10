import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { openDetachedCommand } from "../src/main/externalLinkOpener";

vi.mock("electron", () => ({ shell: {} }));

describe("native Windows file launcher", () => {
  it.runIf(process.platform === "win32")("should resolve a cmd launcher on PATH and retain literal filename characters", async () => {
    const root = await mkdtemp(join(tmpdir(), "opencodex éditeur "));
    try {
      const launcher = join(root, "opencodex-fixture-editor.cmd");
      const output = join(root, "output.json");
      await writeFile(join(root, "capture.cjs"),
        "require('node:fs').writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));");
      await writeFile(launcher,
        `@echo off\r\n"${process.execPath}" "%~dp0capture.cjs" "%~dp0output.json" %*\r\n`);
      const filePath = "C:\\images\\élan & (draft) %PATH%!.png";
      vi.stubEnv("PATH", `${root}${delimiter}${process.env.PATH ?? ""}`);
      vi.stubEnv("PATHEXT", ".COM;.EXE;.BAT;.CMD");

      await openDetachedCommand('opencodex-fixture-editor --goto "%F"', {
        projectPath: null, filePath, relativePath: filePath, line: null, column: null
      });

      await vi.waitFor(async () => {
        expect(JSON.parse(await readFile(output, "utf8"))).toEqual(["--goto", filePath]);
      }, { timeout: 5000 });
    } finally {
      vi.unstubAllEnvs();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("should report a missing launcher without spawning an uncaught process error", async () => {
    const command = join(tmpdir(), "opencodex-missing-editor", "editor");

    await expect(openDetachedCommand(`"${command}" %F`, {
      projectPath: null, filePath: "image.png", relativePath: "image.png", line: null, column: null
    })).rejects.toThrow("Unable to start file opener");
  });
});
