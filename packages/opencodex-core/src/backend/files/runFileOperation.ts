import { randomUUID } from "node:crypto";
import { Worker } from "node:worker_threads";
import type { CodexAppServerClient } from "@open-codex-ui/codex-rpc";
import type { OpenCodexFileRequest, OpenCodexFileResult } from "@open-codex-ui/opencodex-protocol";
import { fileWorkerScript } from "./fileWorkerScript.js";

/** Runs bounded filesystem work off the local main thread. */
export function runLocalFileOperation(request: OpenCodexFileRequest): Promise<OpenCodexFileResult<unknown>> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(fileWorkerScript, { eval: true, workerData: request });
    const timeout = setTimeout(() => {
      void worker.terminate();
      reject(new Error("File operation timed out."));
    }, 30_000);
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`File worker exited without a response (code ${code}).`));
    });
  });
}

/** Runs the same helper in the source filesystem; Node.js must exist on that source. */
export async function runSourceFileOperation(
  client: Pick<CodexAppServerClient, "request" | "onNotification">,
  request: OpenCodexFileRequest
): Promise<OpenCodexFileResult<unknown>> {
  const processHandle = `opencodex-files-${randomUUID()}`;
  let isFinished = false;
  let finish!: (result: OpenCodexFileResult<unknown>) => void;
  const completion = new Promise<OpenCodexFileResult<unknown>>((resolve) => {
    finish = (result) => {
      isFinished = true;
      resolve(result);
    };
  });
  const subscription = client.onNotification((notification) => {
    if (notification.method !== "process/exited") return;
    const params = notification.params;
    if (typeof params !== "object" || params === null || !("processHandle" in params) ||
      params.processHandle !== processHandle) return;
    try {
      if (!("exitCode" in params) || params.exitCode !== 0 ||
        !("stdoutCapReached" in params) || params.stdoutCapReached !== false ||
        !("stdout" in params) || typeof params.stdout !== "string") {
        const detail = "stderr" in params && typeof params.stderr === "string" ? params.stderr : "";
        throw new Error(detail || "File helper failed.");
      }
      const result = JSON.parse(params.stdout) as OpenCodexFileResult<unknown>;
      if (result === null || typeof result !== "object" || typeof result.ok !== "boolean") {
        throw new Error("Invalid file helper response.");
      }
      finish(result);
    } catch (error) {
      finish({ ok: false, code: "unavailable", details: String(error) });
    }
  });
  const timer = setTimeout(() => {
    finish({ ok: false, code: "unavailable", details: "Source file operation timed out." });
    void client.request("process/kill", { processHandle }).catch(() => undefined);
  }, 30_000);
  /** Streams input only while the source operation remains alive. */
  async function sendRequest(): Promise<OpenCodexFileResult<unknown>> {
    await client.request("process/spawn", {
      command: ["node", "-e", fileWorkerScript],
      processHandle,
      cwd: request.target.workspacePath,
      streamStdin: true,
      outputBytesCap: 16 * 1024 * 1024,
      timeoutMs: 30_000
    });
    if (isFinished) {
      void client.request("process/kill", { processHandle }).catch(() => undefined);
      return await completion;
    }
    const input = Buffer.from(JSON.stringify(request), "utf8");
    for (let offset = 0; offset < input.length; offset += 48 * 1024) {
      if (isFinished) return await completion;
      await client.request("process/writeStdin", {
        processHandle,
        deltaBase64: input.subarray(offset, offset + 48 * 1024).toString("base64")
      });
    }
    await client.request("process/writeStdin", { processHandle, closeStdin: true });
    return await completion;
  }
  try {
    return await Promise.race([sendRequest(), completion]);
  } catch (error) {
    isFinished = true;
    void client.request("process/kill", { processHandle }).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    subscription.dispose();
  }
}
