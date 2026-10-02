import { readFile, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

/** Ships PDF.js worker, fonts and decoders locally in both development and packaged builds. */
export function pdfAssets(repoRoot: string): Plugin {
  const requireUi = createRequire(join(repoRoot, "packages/opencodex-ui/package.json"));
  const root = dirname(requireUi.resolve("pdfjs-dist/package.json"));
  let isBuild = false;
  const files = new Map<string, string>([
    ["pdf.worker.mjs", join(root, "legacy/build/pdf.worker.mjs")],
    ["LICENSE", join(root, "LICENSE")]
  ]);
  /** Resolves only known package assets, never a path supplied by an HTTP request. */
  async function collect(): Promise<void> {
    for (const directory of ["cmaps", "standard_fonts", "wasm", "iccs"]) {
      for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
        if (entry.isFile()) files.set(`${directory}/${entry.name}`, join(root, directory, entry.name));
      }
    }
  }
  return {
    name: "bundled-pdf-assets",
    configResolved(config) { isBuild = config.command === "build"; },
    async buildStart() {
      if (!isBuild) return;
      await collect();
      for (const [name, path] of files) {
        this.emitFile({ type: "asset", fileName: `pdfjs/${name}`, source: await readFile(path) });
      }
    },
    async configureServer(server) {
      await collect();
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0] ?? "";
        const file = files.get(path.slice("/pdfjs/".length));
        if (!path.startsWith("/pdfjs/") || file === undefined) return next();
        void readFile(file).then((data) => {
          let contentType = "application/octet-stream";
          if (file.endsWith(".mjs") || file.endsWith(".js")) contentType = "text/javascript";
          if (file.endsWith(".wasm")) contentType = "application/wasm";
          response.setHeader("Content-Type", contentType);
          response.end(data);
        }, next);
      });
    }
  };
}
