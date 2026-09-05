import fs from "node:fs/promises";
import path from "node:path";
import { sanitizePathSegment } from "./projectCommandExecution.js";
import { prefixLines } from "./projectCommandNotifications.js";

/** Owns ordered, best-effort writes to one command run's persistent log. */
export class ProjectCommandLog {
  /** Serializes writes so streamed chunks retain their arrival order. */
  private outputWriteQueue: Promise<void> = Promise.resolve();

  /** Retains the host-local path exposed in the command run DTO. */
  private constructor(readonly path: string) {}

  /** Creates the log directory using the established project/command/run layout. */
  static async create(
    userDataPath: string | undefined,
    projectId: string,
    commandId: string,
    runId: string
  ): Promise<ProjectCommandLog> {
    const root = userDataPath ?? process.cwd();
    const directory = path.join(
      root,
      "opencodexui-logs",
      sanitizePathSegment(projectId),
      sanitizePathSegment(commandId)
    );
    await fs.mkdir(directory, { recursive: true });
    return new ProjectCommandLog(path.join(directory, `${sanitizePathSegment(runId)}.log`));
  }

  /** Queues output without allowing a logging failure to fail command execution. */
  append(stream: "stdout" | "stderr", delta: string): Promise<void> {
    const output = prefixLines(delta, stream === "stderr" ? "[stderr] " : "");
    this.outputWriteQueue = this.outputWriteQueue
      .catch(() => undefined)
      .then(async () => {
        await fs.appendFile(this.path, output, "utf8");
      })
      .catch(() => {
        // Preserve best-effort logging: subsequent chunks must still be attempted.
      });
    return this.outputWriteQueue;
  }
}
