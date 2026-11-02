import type { CachedProjectCommand } from "./automation.js";

/** Project-local groups persist independently of their current command membership. */
export interface CommandGroupsRepository {
  /** Lists the saved catalog, including groups without members. */
  list(projectId: string): Promise<string[]>;
  /** Creates a uniquely named group in the explicit project. */
  create(projectId: string, name: string): Promise<string[]>;
  /** Renames the catalog entry and its memberships atomically. */
  rename(projectId: string, name: string, newName: string): Promise<string[]>;
  /** Removes the catalog entry and returns its commands to ungrouped. */
  delete(projectId: string, name: string): Promise<string[]>;
  /** Changes only membership, requiring an existing group in the command's project. */
  assign(projectId: string, commandId: string, name: string | null): Promise<CachedProjectCommand>;
}
