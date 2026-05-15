/**
 * Generates platform icon assets from the repository icon reference image.
 */
import { access, mkdir, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const repoRoot = resolve(appRoot, "..", "..");
const sourceIconPath = resolve(repoRoot, "icon-reference.png");
const buildResourcesPath = resolve(appRoot, "build");
const iconPngPath = resolve(buildResourcesPath, "icon.png");
const iconIcoPath = resolve(buildResourcesPath, "icon.ico");
const iconIcnsPath = resolve(buildResourcesPath, "icon.icns");
const iconSetPath = resolve(buildResourcesPath, "icon.iconset");

const iconSetSizes = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 }
];

const png2IcnsSizes = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_512x512.png", size: 512 }
];

main().catch((error) => {
  console.error("[OpenCodexUI icons] generation failed");
  console.error(error);
  process.exitCode = 1;
});

/**
 * Generates every supported icon format available on the current host.
 *
 * @returns Promise resolved once icon generation is complete.
 */
async function main() {
  await assertFileExists(sourceIconPath);
  await mkdir(buildResourcesPath, { recursive: true });

  const hasConvert = await commandExists("convert");
  if (!hasConvert) {
    throw new Error("ImageMagick `convert` is required to generate PNG and ICO icons.");
  }

  await generateLinuxPng();
  await generateWindowsIco();
  await generateMacIcns();
}

/**
 * Generates the Linux PNG icon used by Electron Builder.
 *
 * @returns Promise resolved once the PNG has been written.
 */
async function generateLinuxPng() {
  await runCommand("convert", [
    sourceIconPath,
    "-resize",
    "512x512",
    "-background",
    "none",
    "-gravity",
    "center",
    "-extent",
    "512x512",
    iconPngPath
  ]);
  console.info(`[OpenCodexUI icons] wrote ${relativeToRepo(iconPngPath)}`);
}

/**
 * Generates the Windows multi-resolution ICO icon.
 *
 * @returns Promise resolved once the ICO has been written.
 */
async function generateWindowsIco() {
  await runCommand("convert", [
    sourceIconPath,
    "-background",
    "none",
    "-gravity",
    "center",
    "-extent",
    "1136x1136",
    "-define",
    "icon:auto-resize=256,128,64,48,32,16",
    iconIcoPath
  ]);
  console.info(`[OpenCodexUI icons] wrote ${relativeToRepo(iconIcoPath)}`);
}

/**
 * Generates the macOS ICNS icon when a compatible tool is available.
 *
 * @returns Promise resolved once the ICNS has been written or skipped.
 */
async function generateMacIcns() {
  if (await commandExists("iconutil")) {
    await generateMacIcnsWithIconutil();
    return;
  }

  if (await commandExists("png2icns")) {
    await generateMacIcnsWithPng2Icns();
    return;
  }

  console.warn(
    "[OpenCodexUI icons] skipped icon.icns: install `iconutil` or `png2icns` to generate macOS icons."
  );
}

/**
 * Generates a macOS ICNS icon through Apple's iconutil command.
 *
 * @returns Promise resolved once the ICNS has been written.
 */
async function generateMacIcnsWithIconutil() {
  await rm(iconSetPath, { recursive: true, force: true });
  await mkdir(iconSetPath, { recursive: true });
  await generateIconSetFiles();
  await runCommand("iconutil", ["-c", "icns", iconSetPath, "-o", iconIcnsPath]);
  await rm(iconSetPath, { recursive: true, force: true });
  console.info(`[OpenCodexUI icons] wrote ${relativeToRepo(iconIcnsPath)}`);
}

/**
 * Generates a macOS ICNS icon through the icnsutils png2icns command.
 *
 * @returns Promise resolved once the ICNS has been written.
 */
async function generateMacIcnsWithPng2Icns() {
  await rm(iconSetPath, { recursive: true, force: true });
  await mkdir(iconSetPath, { recursive: true });
  await generateIconSetFiles(png2IcnsSizes);

  const iconSetFiles = png2IcnsSizes.map((icon) => resolve(iconSetPath, icon.name));
  await runCommand("png2icns", [iconIcnsPath, ...iconSetFiles]);
  await rm(iconSetPath, { recursive: true, force: true });
  console.info(`[OpenCodexUI icons] wrote ${relativeToRepo(iconIcnsPath)}`);
}

/**
 * Generates the PNG files required by ICNS conversion tools.
 *
 * @param icons Icon dimensions and filenames to generate.
 * @returns Promise resolved once all iconset files have been written.
 */
async function generateIconSetFiles(icons = iconSetSizes) {
  for (const icon of icons) {
    await runCommand("convert", [
      sourceIconPath,
      "-resize",
      `${icon.size}x${icon.size}`,
      "-background",
      "none",
      "-gravity",
      "center",
      "-extent",
      `${icon.size}x${icon.size}`,
      resolve(iconSetPath, icon.name)
    ]);
  }
}

/**
 * Checks whether a command exists on PATH.
 *
 * @param command Command name to resolve.
 * @returns Promise resolving to true when the command exists.
 */
async function commandExists(command) {
  return new Promise((resolvePromise) => {
    const child = spawn("sh", ["-c", `command -v ${command}`], {
      stdio: "ignore"
    });

    child.on("error", () => resolvePromise(false));
    child.on("exit", (code) => resolvePromise(code === 0));
  });
}

/**
 * Runs a command and rejects when it exits with a non-zero status.
 *
 * @param command Executable name to run.
 * @param args Arguments passed to the executable.
 * @returns Promise resolved once the command succeeds.
 */
async function runCommand(command, args) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: "inherit"
    });

    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      rejectPromise(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

/**
 * Fails when the requested file is missing.
 *
 * @param filePath Path to validate.
 * @returns Promise resolved when the file is readable.
 */
async function assertFileExists(filePath) {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`Missing source icon: ${relativeToRepo(filePath)}`);
  }
}

/**
 * Formats a path relative to the repository root for log messages.
 *
 * @param filePath Absolute file path.
 * @returns Relative path when possible.
 */
function relativeToRepo(filePath) {
  return filePath.startsWith(repoRoot)
    ? filePath.slice(repoRoot.length + 1)
    : filePath;
}
