import type { ProjectRuntimeHandler } from "../../projects/ProjectRuntimeHandler.js";
import type {
  CodexUpdatesApi as CodexUpdatesApiContract,
  GroupsApi as GroupsApiContract,
  ProjectContextApi as ProjectContextApiContract,
  ProjectTasksApi as ProjectTasksApiContract,
  ProjectTrustApi as ProjectTrustApiContract,
  ProjectsApi as ProjectsApiContract,
  SourcesApi as SourcesApiContract
} from "./PublicRuntimeApis.js";

type ProjectsHandler = Pick<
  ProjectRuntimeHandler,
  | "listProjects"
  | "setProjectHidden"
  | "updateProjectDisplayName"
  | "updateProjectPreferences"
  | "deleteProject"
  | "openProject"
  | "pickProjectDirectory"
  | "readProjectStatistics"
>;

type SourcesHandler = Pick<
  ProjectRuntimeHandler,
  "listSources" | "createSource" | "syncSources" | "deleteSource" | "updateSource"
>;

type GroupsHandler = Pick<
  ProjectRuntimeHandler,
  | "listProjectGroups"
  | "createProjectGroup"
  | "updateProjectGroup"
  | "deleteProjectGroup"
  | "assignProjectToGroup"
>;

type ProjectContextHandler = Pick<
  ProjectRuntimeHandler,
  "syncProjectContext" | "pickProjectContextFolder"
>;

type ProjectTasksHandler = Pick<
  ProjectRuntimeHandler,
  "listProjectTasks" | "createProjectTask" | "updateProjectTask" | "deleteProjectTask"
>;

type ProjectTrustHandler = Pick<
  ProjectRuntimeHandler,
  "trustProject" | "dismissProjectTrustRequest"
>;

type CodexUpdatesHandler = Pick<
  ProjectRuntimeHandler,
  "checkCodexRelease" | "updateCodexSource"
>;

/**
 * Public project operations with names scoped to the `projects` resource.
 *
 * The handler dependency is deliberately limited to the project operations
 * exposed by this facade. Keeping the dependency as an object also preserves
 * the handler method's receiver when the facade is used by a runtime graph.
 */
export class ProjectsApi implements ProjectsApiContract {
  /** Creates a project API backed by the supplied project handler. */
  constructor(private readonly handler: ProjectsHandler) {}

  /** Lists all cached projects. */
  async list(): ReturnType<ProjectsHandler["listProjects"]> {
    return await this.handler.listProjects();
  }

  /** Updates whether a project is hidden from the project list. */
  async setHidden(
    projectId: Parameters<ProjectsHandler["setProjectHidden"]>[0],
    isHidden: Parameters<ProjectsHandler["setProjectHidden"]>[1]
  ): ReturnType<ProjectsHandler["setProjectHidden"]> {
    return await this.handler.setProjectHidden(projectId, isHidden);
  }

  /** Updates a project's display name, or clears it when `displayName` is null. */
  async setDisplayName(
    projectId: Parameters<ProjectsHandler["updateProjectDisplayName"]>[0],
    displayName: Parameters<ProjectsHandler["updateProjectDisplayName"]>[1]
  ): ReturnType<ProjectsHandler["updateProjectDisplayName"]> {
    return await this.handler.updateProjectDisplayName(projectId, displayName);
  }

  /** Applies a partial preferences update to a project. */
  async updatePreferences(
    projectId: Parameters<ProjectsHandler["updateProjectPreferences"]>[0],
    patch: Parameters<ProjectsHandler["updateProjectPreferences"]>[1]
  ): ReturnType<ProjectsHandler["updateProjectPreferences"]> {
    return await this.handler.updateProjectPreferences(projectId, patch);
  }

  /** Deletes a project from the local cache. */
  async delete(
    projectId: Parameters<ProjectsHandler["deleteProject"]>[0]
  ): ReturnType<ProjectsHandler["deleteProject"]> {
    return await this.handler.deleteProject(projectId);
  }

  /** Opens and caches a project path, optionally creating it in the source. */
  async open(
    projectPath: Parameters<ProjectsHandler["openProject"]>[0],
    sourceId: Parameters<ProjectsHandler["openProject"]>[1],
    createIfMissing: Parameters<ProjectsHandler["openProject"]>[2]
  ): ReturnType<ProjectsHandler["openProject"]> {
    return await this.handler.openProject(projectPath, sourceId, createIfMissing);
  }

  /** Opens the host project directory picker and caches its selection. */
  async pickDirectory(
    mode: Parameters<ProjectsHandler["pickProjectDirectory"]>[0],
    sourceId: Parameters<ProjectsHandler["pickProjectDirectory"]>[1]
  ): ReturnType<ProjectsHandler["pickProjectDirectory"]> {
    return await this.handler.pickProjectDirectory(mode, sourceId);
  }

  /** Reads aggregate token statistics for a project path. */
  async readStatistics(
    projectPath: Parameters<ProjectsHandler["readProjectStatistics"]>[0],
    sourceId: Parameters<ProjectsHandler["readProjectStatistics"]>[1]
  ): ReturnType<ProjectsHandler["readProjectStatistics"]> {
    return await this.handler.readProjectStatistics(projectPath, sourceId);
  }
}

/** Public operations for configured Codex sources. */
export class SourcesApi implements SourcesApiContract {
  /** Creates a source API backed by the supplied project handler. */
  constructor(private readonly handler: SourcesHandler) {}

  /** Lists configured sources. */
  async list(): ReturnType<SourcesHandler["listSources"]> {
    return await this.handler.listSources();
  }

  /** Creates a configured Codex source. */
  async create(
    name: Parameters<SourcesHandler["createSource"]>[0],
    kind: Parameters<SourcesHandler["createSource"]>[1],
    settings: Parameters<SourcesHandler["createSource"]>[2]
  ): ReturnType<SourcesHandler["createSource"]> {
    return await this.handler.createSource(name, kind, settings);
  }

  /** Synchronizes projects from one source, or all sources when `sourceId` is null. */
  async sync(
    sourceId: Parameters<SourcesHandler["syncSources"]>[0]
  ): ReturnType<SourcesHandler["syncSources"]> {
    return await this.handler.syncSources(sourceId);
  }

  /** Deletes a non-default source. */
  async delete(
    sourceId: Parameters<SourcesHandler["deleteSource"]>[0]
  ): ReturnType<SourcesHandler["deleteSource"]> {
    return await this.handler.deleteSource(sourceId);
  }

  /** Updates source metadata and launch settings. */
  async update(
    sourceId: Parameters<SourcesHandler["updateSource"]>[0],
    patch: Parameters<SourcesHandler["updateSource"]>[1]
  ): ReturnType<SourcesHandler["updateSource"]> {
    return await this.handler.updateSource(sourceId, patch);
  }
}

/** Public operations for the project group tree. */
export class GroupsApi implements GroupsApiContract {
  /** Creates a groups API backed by the supplied project handler. */
  constructor(private readonly handler: GroupsHandler) {}

  /** Lists the project group tree. */
  async list(): ReturnType<GroupsHandler["listProjectGroups"]> {
    return await this.handler.listProjectGroups();
  }

  /** Creates a project group under the requested parent. */
  async create(
    name: Parameters<GroupsHandler["createProjectGroup"]>[0],
    parentGroupId: Parameters<GroupsHandler["createProjectGroup"]>[1] = null,
    color: Parameters<GroupsHandler["createProjectGroup"]>[2] = "blue"
  ): ReturnType<GroupsHandler["createProjectGroup"]> {
    return await this.handler.createProjectGroup(name, parentGroupId, color);
  }

  /** Updates a project group. */
  async update(
    groupId: Parameters<GroupsHandler["updateProjectGroup"]>[0],
    patch: Parameters<GroupsHandler["updateProjectGroup"]>[1]
  ): ReturnType<GroupsHandler["updateProjectGroup"]> {
    return await this.handler.updateProjectGroup(groupId, patch);
  }

  /** Deletes a project group while retaining its children. */
  async delete(
    groupId: Parameters<GroupsHandler["deleteProjectGroup"]>[0]
  ): ReturnType<GroupsHandler["deleteProjectGroup"]> {
    return await this.handler.deleteProjectGroup(groupId);
  }

  /** Assigns a project to a group, or to the ungrouped root when null. */
  async assignProject(
    projectId: Parameters<GroupsHandler["assignProjectToGroup"]>[0],
    groupId: Parameters<GroupsHandler["assignProjectToGroup"]>[1]
  ): ReturnType<GroupsHandler["assignProjectToGroup"]> {
    return await this.handler.assignProjectToGroup(projectId, groupId);
  }
}

/** Public operations for synchronizing project context folders. */
export class ProjectContextApi implements ProjectContextApiContract {
  /** Creates a project context API backed by the supplied project handler. */
  constructor(private readonly handler: ProjectContextHandler) {}

  /** Synchronizes configured context folders into the project Codex config. */
  async sync(
    projectId: Parameters<ProjectContextHandler["syncProjectContext"]>[0]
  ): ReturnType<ProjectContextHandler["syncProjectContext"]> {
    return await this.handler.syncProjectContext(projectId);
  }

  /** Opens the host directory picker for an external context folder. */
  async pickFolder(): ReturnType<ProjectContextHandler["pickProjectContextFolder"]> {
    return await this.handler.pickProjectContextFolder();
  }
}

/** Public operations for local project tasks. */
export class ProjectTasksApi implements ProjectTasksApiContract {
  /** Creates a project tasks API backed by the supplied project handler. */
  constructor(private readonly handler: ProjectTasksHandler) {}

  /** Lists tasks configured for a project. */
  async list(
    projectId: Parameters<ProjectTasksHandler["listProjectTasks"]>[0]
  ): ReturnType<ProjectTasksHandler["listProjectTasks"]> {
    return await this.handler.listProjectTasks(projectId);
  }

  /** Creates a task for a project. */
  async create(
    projectId: Parameters<ProjectTasksHandler["createProjectTask"]>[0],
    title: Parameters<ProjectTasksHandler["createProjectTask"]>[1],
    description: Parameters<ProjectTasksHandler["createProjectTask"]>[2],
    status: Parameters<ProjectTasksHandler["createProjectTask"]>[3]
  ): ReturnType<ProjectTasksHandler["createProjectTask"]> {
    return await this.handler.createProjectTask(projectId, title, description, status);
  }

  /** Updates a project task. */
  async update(
    taskId: Parameters<ProjectTasksHandler["updateProjectTask"]>[0],
    patch: Parameters<ProjectTasksHandler["updateProjectTask"]>[1]
  ): ReturnType<ProjectTasksHandler["updateProjectTask"]> {
    return await this.handler.updateProjectTask(taskId, patch);
  }

  /** Deletes a project task. */
  async delete(
    taskId: Parameters<ProjectTasksHandler["deleteProjectTask"]>[0]
  ): ReturnType<ProjectTasksHandler["deleteProjectTask"]> {
    return await this.handler.deleteProjectTask(taskId);
  }
}

/** Public operations for project trust decisions. */
export class ProjectTrustApi implements ProjectTrustApiContract {
  /** Creates a project trust API backed by the supplied project handler. */
  constructor(private readonly handler: ProjectTrustHandler) {}

  /** Adds a project path to Codex's trusted-project configuration. */
  async grant(
    projectPath: Parameters<ProjectTrustHandler["trustProject"]>[0]
  ): ReturnType<ProjectTrustHandler["trustProject"]> {
    return await this.handler.trustProject(projectPath);
  }

  /** Dismisses a pending trust request without modifying Codex configuration. */
  dismiss(
    projectPath: Parameters<ProjectTrustHandler["dismissProjectTrustRequest"]>[0]
  ): ReturnType<ProjectTrustHandler["dismissProjectTrustRequest"]> {
    return this.handler.dismissProjectTrustRequest(projectPath);
  }
}

/** Public operations for checking and applying Codex updates. */
export class CodexUpdatesApi implements CodexUpdatesApiContract {
  /** Creates an updates API backed by the supplied project handler. */
  constructor(private readonly handler: CodexUpdatesHandler) {}

  /** Checks the latest Codex release, optionally bypassing cached metadata. */
  async checkRelease(
    force: Parameters<CodexUpdatesHandler["checkCodexRelease"]>[0]
  ): ReturnType<CodexUpdatesHandler["checkCodexRelease"]> {
    return await this.handler.checkCodexRelease(force);
  }

  /** Applies the available Codex update to one configured source. */
  async applyToSource(
    sourceId: Parameters<CodexUpdatesHandler["updateCodexSource"]>[0]
  ): ReturnType<CodexUpdatesHandler["updateCodexSource"]> {
    return await this.handler.updateCodexSource(sourceId);
  }
}
