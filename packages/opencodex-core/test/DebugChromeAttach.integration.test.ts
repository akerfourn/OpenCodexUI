import { describe, test, expect } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { debugFixture, adapterRuntime, stopFixtureProcess } from "./debugIntegrationFixtures.js";
import { DebugSession } from "../src/backend/debug/DebugSession.js";
import { requireSingleBrowserTarget } from "../src/backend/debug/browserTarget.js";

describe.runIf(process.env.DEBUG_ADAPTER_INTEGRATION === "1")("explicit browser attach", () => {
  test("rejects ambiguous target filters before connecting a debugger", async () => {
    const server = createServer((_request, response) => response.end(JSON.stringify([
      { id: "one", type: "page", url: "http://localhost:3000/one" },
      { id: "two", type: "page", url: "http://localhost:3000/two" }
    ])));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    try {
      await expect(requireSingleBrowserTarget(port, "http://localhost:3000/*")).rejects.toThrow("matches 2 pages");
      await expect(requireSingleBrowserTarget(port, "http://localhost:3000/two")).resolves.toBe("two");
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  test.runIf(Boolean(process.env.DEBUG_CHROME_EXECUTABLE))("attaches to the chosen page and leaves the existing browser alive", async () => {
    const fixture = await debugFixture();
    const server = createServer((_request, response) => response.end(
      "<!doctype html><script>setInterval(() => { debugger; }, 100);</script>"
    ));
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
    const child = spawn(process.env.DEBUG_CHROME_EXECUTABLE!, ["--headless=new", "--no-sandbox", "--disable-gpu",
      "--remote-debugging-port=0", `--user-data-dir=${path.join(fixture.directory, "browser")}`, url],
      { stdio: ["ignore", "ignore", "pipe"] });
    let session: DebugSession | null = null;
    try {
      const port = await new Promise<number>((resolve, reject) => {
        let output = "";
        const timer = setTimeout(() => reject(new Error("Chrome fixture startup timed out")), 10000);
        child.stderr!.on("data", chunk => {
          output = (output + String(chunk)).slice(-8192);
          const match = /DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/.exec(output);
          if (match) { clearTimeout(timer); resolve(Number(match[1])); }
        });
        child.once("error", error => { clearTimeout(timer); reject(error); });
        child.once("exit", () => { clearTimeout(timer); reject(new Error("Chrome fixture exited")); });
      });
      await expect.poll(async () => requireSingleBrowserTarget(port, url), { timeout: 10000 }).toBeTruthy();
      session = new DebugSession({ ...fixture.configuration, target: "chrome", request: "attach", port, urlFilter: url }, () => undefined);
      await session.start(adapterRuntime, []);
      await expect.poll(() => session!.snapshot.state, { timeout: 15000 }).toBe("paused");
      await session.finish();
      expect(session.snapshot.state).toBe("terminated");
      expect(child.exitCode).toBeNull();
      expect(() => process.kill(child.pid!, 0)).not.toThrow();
      await expect(requireSingleBrowserTarget(port, url)).resolves.toBeTruthy();
    } finally {
      await session?.finish();
      await stopFixtureProcess(child);
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      await fixture.dispose();
    }
  }, 30000);
});
