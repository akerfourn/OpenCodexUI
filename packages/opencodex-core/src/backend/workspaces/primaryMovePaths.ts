import path from "node:path";
import { isInsideWorkspace } from "./WorkspaceRemovalRuntime.js";

/** Maps only descendants of the moved directory using its source's path syntax. */
export function primaryMovePath(location: string, previous: string, destination: string): string {
  if (!isInsideWorkspace(location, previous)) return location;
  const syntax = previous.startsWith("/") ? path.posix : path.win32;
  return syntax.join(destination, syntax.relative(previous, location));
}
