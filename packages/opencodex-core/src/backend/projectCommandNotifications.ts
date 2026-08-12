import type { v2 } from "@open-codex-ui/codex-rpc";

/**
 * Reads a typed process output notification.
 *
 * @param value Raw notification params.
 * @returns Output notification, or `null` when invalid.
 */
export function readProcessOutputDelta(value: unknown): v2.ProcessOutputDeltaNotification | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const params = value as Partial<v2.ProcessOutputDeltaNotification>;

  if (
    typeof params.processHandle !== "string" ||
    typeof params.deltaBase64 !== "string" ||
    (params.stream !== "stdout" && params.stream !== "stderr")
  ) {
    return null;
  }

  return {
    processHandle: params.processHandle,
    stream: params.stream,
    deltaBase64: params.deltaBase64,
    capReached: params.capReached === true
  };
}

/**
 * Reads a typed process exit notification.
 *
 * @param value Raw notification params.
 * @returns Exit notification, or `null` when invalid.
 */
export function readProcessExited(value: unknown): v2.ProcessExitedNotification | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const params = value as Partial<v2.ProcessExitedNotification>;

  if (typeof params.processHandle !== "string" || typeof params.exitCode !== "number") {
    return null;
  }

  return {
    processHandle: params.processHandle,
    exitCode: params.exitCode,
    stdout: typeof params.stdout === "string" ? params.stdout : "",
    stdoutCapReached: params.stdoutCapReached === true,
    stderr: typeof params.stderr === "string" ? params.stderr : "",
    stderrCapReached: params.stderrCapReached === true
  };
}

/**
 * Decodes base64 process output from Codex.
 *
 * @param value Base64 output.
 * @returns UTF-8 decoded output.
 */
export function decodeBase64Output(value: string): string {
  return Buffer.from(value, "base64").toString("utf8");
}

/**
 * Maps a process exit code to a command-run status.
 *
 * @param exitCode Process exit code.
 * @returns Successful or failed run status.
 */
export function readExitedStatus(exitCode: number): "exited" | "failed" {
  return exitCode === 0 ? "exited" : "failed";
}

/**
 * Prefixes each non-empty line with a stream marker.
 *
 * @param value Raw output chunk.
 * @param prefix Prefix to add.
 * @returns Prefixed output chunk.
 */
export function prefixLines(value: string, prefix: string): string {
  if (prefix.length === 0) {
    return value;
  }

  return value
    .split(/(\r?\n)/)
    .map((part) => (part === "\n" || part === "\r\n" || part.length === 0 ? part : `${prefix}${part}`))
    .join("");
}
