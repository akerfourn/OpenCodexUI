import type {
  DockerCommandExecutor,
  DockerCommandHandle,
  DockerCommandObserver,
  DockerCommandRequest,
  DockerCommandResult
} from "./command.js";
import { DockerCommandError } from "./errors.js";

/** Runs one Docker command and rejects non-zero exits. */
export async function runChecked(
  executor: DockerCommandExecutor,
  request: DockerCommandRequest
): Promise<DockerCommandResult> {
  const result = await executor.run(request);

  if (result.exitCode !== 0) {
    throw new DockerCommandError(request, result);
  }

  return result;
}

/** Streams one Docker command and rejects non-zero completion. */
export function streamChecked(
  executor: DockerCommandExecutor,
  request: DockerCommandRequest,
  observer?: DockerCommandObserver
): DockerCommandHandle {
  const handle = executor.stream(request, observer);
  let didStop = false;

  return {
    completion: handle.completion.then((result) => {
      if (!didStop && result.exitCode !== 0) {
        throw new DockerCommandError(request, result);
      }

      return result;
    }),
    stop: () => {
      didStop = true;
      handle.stop();
    }
  };
}
