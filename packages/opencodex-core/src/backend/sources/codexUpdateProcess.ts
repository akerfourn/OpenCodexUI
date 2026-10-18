import { spawn } from "node:child_process";
import type { ResolvedCodexCommand } from "@open-codex-ui/codex-rpc";

export interface CodexUpdateProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a bounded detection or update command in its own filesystem environment. */
export type CodexUpdateProcessRunner = (
  command: ResolvedCodexCommand,
  timeoutMs: number
) => Promise<CodexUpdateProcessResult>;

const MAX_OUTPUT_BYTES = 512 * 1024;

/** Captures bounded output without opening a terminal or interpreting native WSL arguments in cmd.exe. */
export function runCodexUpdateProcess(
  command: ResolvedCodexCommand,
  timeoutMs: number
): Promise<CodexUpdateProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, {
      shell: command.shell,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Timed out while running ${command.command}.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      if (stdoutBytes < MAX_OUTPUT_BYTES) stdout.push(chunk.subarray(0, MAX_OUTPUT_BYTES - stdoutBytes));
      stdoutBytes += chunk.length;
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrBytes < MAX_OUTPUT_BYTES) stderr.push(chunk.subarray(0, MAX_OUTPUT_BYTES - stderrBytes));
      stderrBytes += chunk.length;
    });
    child.once("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", exitCode => {
      clearTimeout(timeout);
      resolve({ exitCode, stdout: decodeOutput(stdout, stdoutBytes), stderr: decodeOutput(stderr, stderrBytes) });
    });
  });
}

/** Preserves UTF-8 across chunks and decodes native WSL launch failures emitted as UTF-16LE. */
function decodeOutput(chunks: Buffer[], totalBytes: number): string {
  const buffer = Buffer.concat(chunks);
  let encoding: BufferEncoding = "utf8";
  if (buffer.length > 3 && buffer[1] === 0 && buffer[3] === 0) encoding = "utf16le";
  let output = buffer.toString(encoding);
  if (totalBytes > MAX_OUTPUT_BYTES) output += "\n[output truncated]";
  return output;
}
