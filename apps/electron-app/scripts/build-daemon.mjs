import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const rustRoot = fileURLToPath(new URL("../../../rust/", import.meta.url));
const execFileAsync = promisify(execFile);

const rustTargets = {
  darwin: {
    arm64: "aarch64-apple-darwin",
    x64: "x86_64-apple-darwin"
  },
  linux: {
    arm64: "aarch64-unknown-linux-gnu",
    armv7l: "armv7-unknown-linux-gnueabihf",
    ia32: "i686-unknown-linux-gnu",
    x64: "x86_64-unknown-linux-gnu"
  },
  win32: {
    arm64: "aarch64-pc-windows-msvc",
    ia32: "i686-pc-windows-msvc",
    x64: "x86_64-pc-windows-msvc"
  }
};

/** Builds the daemon for the requested Electron target and stages the executable. */
export async function buildRustDaemon(
  platform = process.platform,
  arch = process.arch,
  destination = join(appRoot, "build", "daemon", "dev")
) {
  const target = rustTargets[platform]?.[arch];
  if (target === undefined) {
    throw new Error(`No Rust daemon target is configured for ${platform}/${arch}.`);
  }

  const targetDirectory = join(rustRoot, "target");
  const { cargo, hostTarget } = await findCargo();
  // Native builds use the shorter output path needed by MSVC in deep worktrees.
  const isNative = target === hostTarget && process.env.CARGO_BUILD_TARGET === undefined;
  const args = ["build", "--package", "opencodex-daemon", "--locked", "--release", "--target-dir", targetDirectory];
  if (!isNative) args.push("--target", target);

  await runCargo(cargo, args);

  const executable = platform === "win32" ? "opencodex-daemon.exe" : "opencodex-daemon";
  const outputDirectory = isNative ? targetDirectory : join(targetDirectory, target);
  await mkdir(destination, { recursive: true });
  await copyFile(join(outputDirectory, "release", executable), join(destination, executable));
}

/** Prepares the resource folder for the platform and architecture electron-builder is packing. */
export async function beforePack(context) {
  const { Arch } = await import("electron-builder");
  const arch = Arch[context.arch];
  const os = context.packager.platform.buildConfigurationKey;
  await buildRustDaemon(context.electronPlatformName, arch, join(appRoot, "build", "daemon", os, arch));
}

/** Finds Cargo and reads its host target using the workspace's toolchain. */
async function findCargo() {
  const configuredCargo = process.env.CARGO;
  const cargoHome = process.env.CARGO_HOME ?? join(homedir(), ".cargo");
  const executable = process.platform === "win32" ? "cargo.exe" : "cargo";
  const rustupCargo = resolve(rustRoot, cargoHome, "bin", executable);
  const candidates = configuredCargo === undefined ? ["cargo", rustupCargo] : [configuredCargo];

  let missingCargo;
  for (const cargo of candidates) {
    try {
      const { stdout } = await execFileAsync(cargo, ["--version", "--verbose"], {
        cwd: rustRoot,
        windowsHide: true
      });
      return { cargo, hostTarget: stdout.match(/^host: (.+)$/m)?.[1] };
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missingCargo = error;
    }
  }

  throw new Error("Cargo could not be found. Set CARGO to Cargo's full path or install Rust with rustup.", {
    cause: missingCargo
  });
}

/** Runs Cargo from the workspace so rustup resolves its pinned toolchain. */
async function runCargo(cargo, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(cargo, args, { cwd: rustRoot, stdio: "inherit", windowsHide: true });
    child.once("error", (error) => {
      reject(new Error("Unable to launch Cargo to build the Rust daemon.", { cause: error }));
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Rust daemon build failed (exit code ${code}, signal ${signal}).`));
    });
  });
}
