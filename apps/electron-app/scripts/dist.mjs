import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const electronBuilderCliPath = require.resolve("electron-builder/out/cli/cli.js");
const child = spawn(process.execPath, [electronBuilderCliPath, ...process.argv.slice(2)], {
  env: {
    ...process.env,
    ELECTRON_BUILDER_DISABLE_BUILD_CACHE: "true"
  },
  shell: false,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
