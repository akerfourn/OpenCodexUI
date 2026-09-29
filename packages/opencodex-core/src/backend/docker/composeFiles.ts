import type { SourceDockerProcessClient } from "./SourceDockerCommandExecutor.js";

/** Explicit selection failures are safe to show without including Docker output. */
export class ComposeFileSelectionError extends Error {}

/** Lists only direct Compose files in the source-owned workspace, including named variants. */
export async function discoverComposeFiles(client: SourceDockerProcessClient, projectPath: string): Promise<string[]> {
  const result = await client.request<{ entries: Array<{ fileName: string; isFile: boolean }> }>(
    "fs/readDirectory", { path: projectPath }
  );
  const files = result.entries.filter(entry => entry.isFile && isComposeFileName(entry.fileName))
    .map(entry => entry.fileName);
  return [...new Set(files)].sort();
}

/** Accepts Compose basenames only; paths, control characters and unrelated YAML files are excluded. */
export function isComposeFileName(name: string): boolean {
  return /^(?:docker-compose|compose)(?:\.[^/\\\0\r\n]+)?\.ya?ml$/u.test(name);
}

/** Commands must use a still-existing explicit file, never Docker's automatic discovery. */
export async function requireComposeFile(
  client: SourceDockerProcessClient, projectPath: string, selected: string | undefined
): Promise<string> {
  if (selected === undefined || !isComposeFileName(selected)) {
    throw new ComposeFileSelectionError("Select a Docker Compose file before running an operation.");
  }
  const files = await discoverComposeFiles(client, projectPath);
  if (!files.includes(selected)) {
    throw new ComposeFileSelectionError("The selected Docker Compose file is no longer available. Select a file again.");
  }
  return selected;
}
