import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access, mkdtemp, readFile, rename, rm, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const version = "1.140.0";
const checksum = "27dab92937ec1ab35821ae955aac867544fe06a1b6307229049f2d789af10968";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../build/debug-adapter");

/** Fetches a pinned official archive only at build time, retaining its distribution notices. */
export async function prepareDebugAdapter(archivePath) {
  const destination = join(root, version);
  try {
    await access(join(destination, "js-debug/src/dapDebugServer.js"));
    await access(join(destination, "js-debug/package.json"));
    if ((await readFile(join(destination, "checksum"), "utf8")) === checksum) return;
  } catch { /* Missing build cache is populated below. */ }
  await mkdir(root, { recursive: true });
  const temporary = await mkdtemp(join(root, ".download-"));
  try {
    let archive;
    if (archivePath) archive = await readFile(archivePath);
    else {
      console.log(`Preparing Microsoft js-debug ${version} (build-time download)…`);
      const response = await fetch(
        `https://github.com/microsoft/vscode-js-debug/releases/download/v${version}/js-debug-dap-v${version}.tar.gz`,
        { signal: AbortSignal.timeout(60_000) }
      );
      if (!response.ok) throw new Error(`js-debug download failed: HTTP ${response.status}`);
      archive = Buffer.from(await response.arrayBuffer());
    }
    if (createHash("sha256").update(archive).digest("hex") !== checksum) {
      throw new Error("js-debug archive checksum mismatch.");
    }
    const file = join(temporary, "adapter.tar.gz");
    await writeFile(file, archive);
    await promisify(execFile)("tar", ["-xzf", file, "-C", temporary]);
    await rm(file);
    await access(join(temporary, "js-debug/LICENSE"));
    // The standalone archive omits package.json; isolate its CommonJS bundles
    // from the application's ESM package scope, including worker/bootloader files.
    await writeFile(join(temporary, "js-debug/package.json"), JSON.stringify({
      name: "opencodex-bundled-js-debug", version, private: true, type: "commonjs"
    }, null, 2) + "\n");
    await writeFile(join(temporary, "checksum"), checksum);
    await rm(destination, { recursive: true, force: true });
    await rename(temporary, destination);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepareDebugAdapter(process.argv[2]);
}
