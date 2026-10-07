import { fileURLToPath } from "node:url";

import { AppInfo, Arch, Packager, WinPackager } from "electron-builder";
import { beforeAll, describe, expect, test } from "vitest";

const appDirectory = fileURLToPath(new URL("../", import.meta.url));
const githubAssetNamePattern = /^[0-9A-Za-z._-]+$/;

describe("Windows release artifact names", () => {
  let packager: Packager;
  let windowsPackager: WinPackager;

  beforeAll(async () => {
    packager = new Packager({ projectDir: appDirectory });
    await packager.validateConfig();
    packager._appInfo = new AppInfo(packager, null);
    windowsPackager = new WinPackager(packager);
  });

  test("should preserve the installer filename when publishing to GitHub", () => {
    const filename = windowsPackager.expandArtifactNamePattern(
      packager.config.nsis ?? {}, "exe", Arch.x64
    );

    // Unsafe names are rewritten differently by electron-builder and GitHub uploads.
    expect(filename, "The installer and update metadata must use the same asset name")
      .toMatch(githubAssetNamePattern);
  });

  test("should preserve the portable filename when publishing to GitHub", () => {
    const filename = windowsPackager.expandArtifactNamePattern(
      packager.config.portable ?? {}, "exe", Arch.x64
    );

    expect(filename, "The portable executable must retain its published asset name")
      .toMatch(githubAssetNamePattern);
  });
});
