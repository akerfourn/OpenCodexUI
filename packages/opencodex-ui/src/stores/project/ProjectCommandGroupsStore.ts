import { makeAutoObservable, runInAction } from "mobx";
import type { OpenCodexProjectCommand, OpenCodexRequest } from "@open-codex-ui/opencodex-protocol";
import type { RootStore } from "../RootStore";
import type { ProjectStore } from "./ProjectStore";
import type { ProjectCommandsStore } from "./ProjectCommandsStore";

type GroupMutation = Extract<OpenCodexRequest, {
  type: "projectCommands.groups.create" | "projectCommands.groups.rename" | "projectCommands.groups.delete";
}>;

/** Owns the explicit project group catalog, independently of command execution or source connectivity. */
export class ProjectCommandGroupsStore {
  /** Saved catalog includes empty groups. */
  private savedNames: string[] = [];
  /** Group changes and assignment serialize local metadata edits. */
  isSaving = false;
  /** Errors remain visible beside the integrated group controls. */
  error: string | null = null;
  /** Invalidates replies after project disposal and overlapping catalog reloads. */
  private generation = 0;

  /** Keeps observable UI state inside this store and sends only primitive metadata. */
  constructor(
    private readonly commands: ProjectCommandsStore,
    private readonly project: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ProjectCommandGroupsStore, "commands" | "project" | "root">(
      this, { commands: false, project: false, root: false }, { autoBind: true }
    );
  }

  /** Includes memberships from command snapshots for compatibility with existing catalog readers. */
  get names(): string[] {
    const names = new Set(this.savedNames);
    for (const command of this.commands.commands) {
      if (command.groupName != null) names.add(command.groupName);
    }
    return [...names];
  }

  /** Reads empty groups without requiring a running Codex source. */
  async load(): Promise<void> {
    if (this.isSaving) return;
    this.error = null;
    const generation = ++this.generation;
    try {
      const names = await this.root.request<string[]>({
        type: "projectCommands.groups.list", projectId: this.project.project.id
      });
      runInAction(() => {
        if (generation === this.generation) this.savedNames = names;
      });
    } catch (error) {
      runInAction(() => {
        if (generation === this.generation) this.error = String(error);
      });
    }
  }

  /** Creates a persistent empty group directly from the side panel. */
  async create(name: string): Promise<boolean> {
    return await this.mutate({
      type: "projectCommands.groups.create", projectId: this.project.project.id, name: name.trim()
    });
  }

  /** Changes every membership transactionally in the backend. */
  async rename(name: string, newName: string): Promise<boolean> {
    return await this.mutate({
      type: "projectCommands.groups.rename", projectId: this.project.project.id, name, newName: newName.trim()
    });
  }

  /** Removes only the group, returning its commands to the ungrouped section. */
  async delete(name: string): Promise<boolean> {
    return await this.mutate({
      type: "projectCommands.groups.delete", projectId: this.project.project.id, name
    });
  }

  /** Assigns a fixed command identity to a current project-local group without rewriting executable fields. */
  async assign(command: OpenCodexProjectCommand, name: string | null): Promise<void> {
    if (this.isSaving || this.commands.isSaving) return;
    this.isSaving = true;
    this.error = null;
    const generation = ++this.generation;
    try {
      const updated = await this.root.request<OpenCodexProjectCommand>({
        type: "projectCommands.groups.assign", projectId: this.project.project.id, commandId: command.id, name
      });
      runInAction(() => {
        if (generation !== this.generation) return;
        this.commands.commands = this.commands.commands.map(item => item.id === updated.id ? updated : item);
      });
    } catch (error) {
      await this.recover(error, generation);
    } finally {
      runInAction(() => {
        if (generation === this.generation) this.isSaving = false;
      });
    }
  }

  /** Publishes catalog and membership snapshots together to avoid transient duplicate sections. */
  private async mutate(request: GroupMutation): Promise<boolean> {
    if (this.isSaving || this.commands.isSaving) return false;
    this.isSaving = true;
    this.error = null;
    const generation = ++this.generation;
    try {
      const names = await this.root.request<string[]>(request);
      const commands = await this.root.request<OpenCodexProjectCommand[]>({
        type: "projectCommands.list", projectId: request.projectId
      });
      runInAction(() => {
        if (generation !== this.generation) return;
        this.savedNames = names;
        this.commands.commands = commands;
      });
      return generation === this.generation;
    } catch (error) {
      await this.recover(error, generation);
      return false;
    } finally {
      runInAction(() => {
        if (generation === this.generation) this.isSaving = false;
      });
    }
  }

  /** Re-reads after uncertain writes without retrying creation, rename, deletion or assignment. */
  private async recover(error: unknown, generation: number): Promise<void> {
    if (generation !== this.generation) return;
    let message = String(error);
    try {
      const [names, commands] = await Promise.all([
        this.root.request<string[]>({ type: "projectCommands.groups.list", projectId: this.project.project.id }),
        this.root.request<OpenCodexProjectCommand[]>({ type: "projectCommands.list", projectId: this.project.project.id })
      ]);
      runInAction(() => {
        if (generation !== this.generation) return;
        this.savedNames = names;
        this.commands.commands = commands;
      });
    } catch (refreshError) {
      message += `\nRefresh failed: ${String(refreshError)}`;
    }
    runInAction(() => {
      if (generation === this.generation) this.error = message;
    });
  }

  /** Invalidates in-flight callbacks without changing persistent group definitions. */
  dispose(): void {
    this.generation += 1;
  }
}
