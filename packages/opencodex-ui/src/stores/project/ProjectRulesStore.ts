/**
 * Holds project-local Codex command rule state and synchronization actions.
 */
import { makeAutoObservable, runInAction } from "mobx";

import type {
  OpenCodexCommandRuleDecision,
  OpenCodexEvent,
  OpenCodexProjectCommandRule,
  OpenCodexProjectCommandRuleApplyResult,
  OpenCodexProjectCommandRuleTestResult,
  OpenCodexProjectCommandRuleStatus,
  OpenCodexProjectCommandRulesSnapshot
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "./ProjectStore";
import type { RootStore } from "../RootStore";

/** Editable project rule form shape. */
export type ProjectRuleFormInput = {
  name: string;
  pattern: string;
  decision: OpenCodexCommandRuleDecision;
  justification: string;
  matchExamples: string;
  notMatchExamples: string;
  enabled: boolean;
};

/** Conservative presets for common project test commands. */
export const projectRulePresets: Array<{
  name: string;
  pattern: string;
  decision: OpenCodexCommandRuleDecision;
  justification: string;
}> = [
  {
    name: "uv run pytest",
    pattern: "uv\nrun\npytest",
    decision: "allow",
    justification: "Les tests du projet peuvent être exécutés sans approbation."
  },
  {
    name: "uv run python -m pytest",
    pattern: "uv\nrun\npython\n-m\npytest",
    decision: "allow",
    justification: "Les tests du projet peuvent être exécutés sans approbation."
  },
  {
    name: "npm test",
    pattern: "npm\ntest",
    decision: "allow",
    justification: "Les tests du projet peuvent être exécutés sans approbation."
  },
  {
    name: "npm run test",
    pattern: "npm\nrun\ntest",
    decision: "allow",
    justification: "Les tests du projet peuvent être exécutés sans approbation."
  },
  {
    name: "pnpm test",
    pattern: "pnpm\ntest",
    decision: "allow",
    justification: "Les tests du projet peuvent être exécutés sans approbation."
  },
  {
    name: "pnpm run test",
    pattern: "pnpm\nrun\ntest",
    decision: "allow",
    justification: "Les tests du projet peuvent être exécutés sans approbation."
  }
];

/**
 * Stores managed project rules for one opened project.
 */
export class ProjectRulesStore {
  /** Invalidates physical-file replies after checkout changes, including A → B → A. */
  private workspaceRevision = 0;
  rules: OpenCodexProjectCommandRule[] = [];
  status: OpenCodexProjectCommandRuleStatus | null = null;
  testResult: OpenCodexProjectCommandRuleTestResult | null = null;
  isLoading = false;
  isSaving = false;
  isApplying = false;
  isTesting = false;
  isRestarting = false;
  errorMessage: string | null = null;

  /** Clears physical status while retaining project-wide rule definitions. */
  invalidateWorkspace(): void {
    this.workspaceRevision += 1;
    this.status = null;
    this.testResult = null;
    this.errorMessage = null;
    this.isLoading = false;
    this.isApplying = false;
    this.isTesting = false;
    this.isRestarting = false;
  }

  /**
   * Creates the rule store.
   *
   * @param projectStore Owning project store.
   * @param root Root store used for backend requests.
   */
  constructor(
    private readonly projectStore: ProjectStore,
    private readonly root: RootStore
  ) {
    makeAutoObservable<ProjectRulesStore, "projectStore" | "root">(
      this,
      {
        projectStore: false,
        root: false
      },
      { autoBind: true }
    );
  }

  /**
   * Returns whether this project can use the rule feature.
   *
   * @returns `true` when a Codex source is available.
   */
  get isAvailable(): boolean {
    return this.projectStore.project.sourceId !== null && this.projectStore.isCodexSourceReady;
  }

  /**
   * Returns whether the generated file differs from the desired rules.
   *
   * @returns `true` when generation is needed.
   */
  get hasPendingFileChanges(): boolean {
    return this.status?.fileStatus === "pending" || this.status?.fileStatus === "notGenerated";
  }

  /**
   * Returns whether an external file conflict needs confirmation.
   *
   * @returns `true` when overwriting requires explicit confirmation.
   */
  get hasExternalFileConflict(): boolean {
    return this.status?.fileStatus === "external";
  }

  /**
   * Returns whether a source restart is required or running.
   *
   * @returns `true` when runtime maintenance is active.
   */
  get requiresRestart(): boolean {
    return this.status?.runtimeState === "restartPending" ||
      this.status?.runtimeState === "restarting" ||
      this.status?.runtimeState === "error";
  }

  /**
   * Loads rules and file status for the project.
   *
   * @returns Promise resolved when state is refreshed.
   */
  async loadRules(): Promise<void> {
    const revision = this.workspaceRevision;
    this.isLoading = true;
    this.errorMessage = null;

    try {
      const snapshot = await this.root.request<OpenCodexProjectCommandRulesSnapshot>({
        type: "projectRules.list",
        ...(this.projectStore.workspaceId === undefined ? {} : { workspaceId: this.projectStore.workspaceId }),
        projectId: this.projectStore.project.id
      });
      if (revision !== this.workspaceRevision) return;
      this.applySnapshot(snapshot);
    } catch (error) {
      if (revision === this.workspaceRevision) this.reportError(error);
    } finally {
      runInAction(() => {
        if (revision === this.workspaceRevision) this.isLoading = false;
      });
    }
  }

  /**
   * Creates a project rule.
   *
   * @param input Rule form input.
   * @returns Promise resolved when the rule is saved.
   */
  async createRule(input: ProjectRuleFormInput): Promise<void> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      await this.root.request<OpenCodexProjectCommandRule>({
        type: "projectRules.create",
        projectId: this.projectStore.project.id,
        ...normalizeRuleFormInput(input)
      });
      await this.loadRules();
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /**
   * Updates a project rule.
   *
   * @param ruleId Rule identifier.
   * @param input Rule form input.
   * @returns Promise resolved when the rule is saved.
   */
  async updateRule(ruleId: string, input: ProjectRuleFormInput): Promise<void> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      await this.root.request<OpenCodexProjectCommandRule>({
        type: "projectRules.update",
        ruleId,
        patch: normalizeRuleFormInput(input)
      });
      await this.loadRules();
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /**
   * Deletes a project rule.
   *
   * @param ruleId Rule identifier.
   * @returns Promise resolved when deletion completes.
   */
  async deleteRule(ruleId: string): Promise<void> {
    this.isSaving = true;
    this.errorMessage = null;

    try {
      await this.root.request({ type: "projectRules.delete", ruleId });
      await this.loadRules();
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /**
   * Writes the generated file, optionally overwriting an external change.
   *
   * @param force Whether an external file may be overwritten.
   * @returns Apply result.
   */
  async applyRules(force = false): Promise<OpenCodexProjectCommandRuleApplyResult | null> {
    const revision = this.workspaceRevision;
    this.isApplying = true;
    this.errorMessage = null;

    try {
      const result = await this.root.request<OpenCodexProjectCommandRuleApplyResult>({
        type: "projectRules.apply",
        ...(this.projectStore.workspaceId === undefined ? {} : { workspaceId: this.projectStore.workspaceId }),
        projectId: this.projectStore.project.id,
        force
      });
      if (revision !== this.workspaceRevision) return null;
      this.applySnapshot(result.snapshot);
      return result;
    } catch (error) {
      if (revision === this.workspaceRevision) this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        if (revision === this.workspaceRevision) this.isApplying = false;
      });
    }
  }

  /**
   * Tests a command against the generated file.
   *
   * @param command Command line to test.
   * @returns Policy test result, or `null` on failure.
   */
  async testRule(command: string): Promise<OpenCodexProjectCommandRuleTestResult | null> {
    const revision = this.workspaceRevision;
    this.isTesting = true;
    this.errorMessage = null;

    try {
      const result = await this.root.request<OpenCodexProjectCommandRuleTestResult>({
        type: "projectRules.test",
        ...(this.projectStore.workspaceId === undefined ? {} : { workspaceId: this.projectStore.workspaceId }),
        projectId: this.projectStore.project.id,
        command
      });
      if (revision !== this.workspaceRevision) return null;
      runInAction(() => {
        this.testResult = result;
      });
      return result;
    } catch (error) {
      if (revision === this.workspaceRevision) this.reportError(error);
      return null;
    } finally {
      runInAction(() => {
        if (revision === this.workspaceRevision) this.isTesting = false;
      });
    }
  }

  /**
   * Restarts Codex for the project's source.
   *
   * @returns Promise resolved when the source is ready again.
   */
  async restartRules(): Promise<void> {
    const revision = this.workspaceRevision;
    this.isRestarting = true;
    this.errorMessage = null;

    try {
      const snapshot = await this.root.request<OpenCodexProjectCommandRulesSnapshot>({
        type: "projectRules.restart",
        ...(this.projectStore.workspaceId === undefined ? {} : { workspaceId: this.projectStore.workspaceId }),
        projectId: this.projectStore.project.id
      });
      if (revision !== this.workspaceRevision) return;
      this.applySnapshot(snapshot);
    } catch (error) {
      if (revision === this.workspaceRevision) this.reportError(error);
      throw error;
    } finally {
      runInAction(() => {
        if (revision === this.workspaceRevision) this.isRestarting = false;
      });
    }
  }

  /**
   * Applies a backend rules event to this project's state.
   *
   * @param event Backend event.
   * @returns Nothing.
   */
  handleEvent(event: OpenCodexEvent): void {
    if (event.type !== "projectRules.updated" || event.projectId !== this.projectStore.project.id) {
      return;
    }
    // Physical rule status belongs to the checkout that produced the event.
    if (event.workspacePath !== undefined && event.workspacePath !== (this.projectStore.workspacePath ?? this.projectStore.project.path)) {
      return;
    }
    this.applySnapshot(event.snapshot);
  }

  /**
   * Applies a complete backend snapshot.
   *
   * @param snapshot Snapshot to store.
   * @returns Nothing.
   */
  private applySnapshot(snapshot: OpenCodexProjectCommandRulesSnapshot): void {
    runInAction(() => {
      this.rules = snapshot.rules;
      this.status = snapshot.status;
    });
  }

  /**
   * Forwards a rule error to the global application error surface.
   *
   * @param error Unknown caught error.
   * @returns Nothing.
   */
  private reportError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.errorMessage = message;
    this.root.appStore.errorMessage = message;
  }
}

/**
 * Converts the multiline form representation into transport arrays.
 *
 * @param input Form input.
 * @returns Transport-ready rule input.
 */
function normalizeRuleFormInput(input: ProjectRuleFormInput): {
  name: string;
  pattern: string[];
  decision: OpenCodexCommandRuleDecision;
  justification: string | null;
  matchExamples: string[];
  notMatchExamples: string[];
  enabled: boolean;
} {
  return {
    name: input.name.trim(),
    pattern: splitLines(input.pattern),
    decision: input.decision,
    justification: input.justification.trim().length === 0 ? null : input.justification.trim(),
    matchExamples: splitLines(input.matchExamples),
    notMatchExamples: splitLines(input.notMatchExamples),
    enabled: input.enabled
  };
}

/**
 * Splits one textarea into non-empty trimmed lines.
 *
 * @param value Textarea value.
 * @returns Normalized lines.
 */
function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
