import type {
  OpenCodexApprovalDecision,
  OpenCodexFileSearchResult,
  OpenCodexImageAttachment,
  OpenCodexInstalledPluginListResult,
  OpenCodexLogEntry,
  OpenCodexLogPage,
  OpenCodexLogRetentionUnit,
  OpenCodexModel,
  OpenCodexPluginDetail,
  OpenCodexPluginCatalogRefreshResult,
  OpenCodexPluginInstallResult,
  OpenCodexPluginListResult,
  OpenCodexPluginSearchResult,
  OpenCodexSettings,
  OpenCodexSkillSearchResult,
  OpenCodexUsageHistory,
  OpenCodexUsageHistoryAggregation,
  OpenCodexUsageResetConsumeResult,
  OpenCodexUsageSnapshot
} from "@open-codex-ui/opencodex-protocol";

import type { ApplicationLogService } from "../../support/ApplicationLogService.js";
import type { ApprovalService } from "../../support/ApprovalService.js";
import type { HostIntegrationService } from "../../support/HostIntegrationService.js";
import type { ModelCatalogService } from "../../support/ModelCatalogService.js";
import type { PluginService } from "../../support/PluginService.js";
import type { ProjectSearchService } from "../../projects/ProjectSearchService.js";
import type { UsageRuntimeService } from "../../usage/UsageRuntimeService.js";
import type { RuntimeSettingsPort } from "../runtimePorts.js";
import type {
  ApprovalsApi as ApprovalsApiContract,
  HostApi as HostApiContract,
  LogsApi as LogsApiContract,
  ModelsApi as ModelsApiContract,
  PluginTarget,
  PluginsApi as PluginsApiContract,
  SearchApi as SearchApiContract,
  SettingsApi as SettingsApiContract,
  UsageApi as UsageApiContract
} from "./PublicRuntimeApis.js";

type LogsApiService = Pick<ApplicationLogService, "listLogs" | "deleteLog" | "clearLogs" | "createLog">;

/** Exposes persisted application log operations. */
export class LogsApi implements LogsApiContract {
  /** Creates a logs API over the application log service. */
  constructor(private readonly service: LogsApiService) {}

  /** Lists persisted application logs. */
  async list(beforeCreatedAt: string | null, limit: number): Promise<OpenCodexLogPage> {
    return await this.service.listLogs(beforeCreatedAt, limit);
  }

  /** Deletes one persisted application log. */
  async delete(logId: string): Promise<{ ok: true }> {
    return await this.service.deleteLog(logId);
  }

  /** Clears all logs or retains entries newer than the requested amount and unit. */
  async clear(
    mode: "all" | "olderThan",
    amount: number,
    unit: OpenCodexLogRetentionUnit
  ): Promise<{ ok: true }> {
    return await this.service.clearLogs(mode, amount, unit);
  }

  /** Persists an application log entry. */
  async create(
    type: OpenCodexLogEntry["type"],
    message: string,
    details: unknown
  ): Promise<{ ok: true }> {
    return await this.service.createLog(type, message, details);
  }
}

type UsageApiService = Pick<UsageRuntimeService, "readUsageLimits" | "readUsageHistory" | "consumeUsageReset">;

/** Exposes source-scoped usage operations. */
export class UsageApi implements UsageApiContract {
  /** Creates a usage API over the usage runtime service. */
  constructor(private readonly service: UsageApiService) {}

  /** Reads usage limits for the requested or configured default source. */
  async readLimits(
    sourceId: string | null = null,
    reason: Parameters<UsageRuntimeService["readUsageLimits"]>[1] = "request"
  ): Promise<OpenCodexUsageSnapshot | null> {
    return await this.service.readUsageLimits(sourceId, reason);
  }

  /** Reads cached source-scoped usage history for an ISO range. */
  async readHistory(
    sourceId: string,
    from: string,
    to: string,
    aggregation?: OpenCodexUsageHistoryAggregation
  ): Promise<OpenCodexUsageHistory> {
    return await this.service.readUsageHistory(sourceId, from, to, aggregation);
  }

  /** Consumes a source-scoped reset credit idempotently. */
  async consumeReset(
    sourceId: string,
    creditId: string,
    idempotencyKey: string
  ): Promise<OpenCodexUsageResetConsumeResult> {
    return await this.service.consumeUsageReset(sourceId, creditId, idempotencyKey);
  }
}

type ModelsApiService = Pick<ModelCatalogService, "listModels">;

/** Exposes the model catalog using the configured default source. */
export class ModelsApi implements ModelsApiContract {
  /** Creates a models API over the catalog and settings services. */
  constructor(
    private readonly service: ModelsApiService,
    private readonly settings: Pick<RuntimeSettingsPort, "getSettings">
  ) {}

  /** Lists models for the configured default source. */
  async list(): Promise<OpenCodexModel[]> {
    return await this.service.listModels(this.settings.getSettings().defaultSourceId);
  }
}

type PluginsApiService = Pick<
  PluginService,
  "list" | "installed" | "search" | "refresh" | "read" | "install" | "uninstall"
>;

/** Exposes plugin marketplace operations. */
export class PluginsApi implements PluginsApiContract {
  /** Creates a plugins API over the plugin service. */
  constructor(private readonly service: PluginsApiService) {}

  /** Lists plugins visible from a Codex source. */
  async list(sourceId: string | null): Promise<OpenCodexPluginListResult> {
    return await this.service.list(sourceId);
  }

  /** Lists only installed plugins for a Codex source. */
  async installed(sourceId: string | null): Promise<OpenCodexInstalledPluginListResult> {
    return await this.service.installed(sourceId);
  }

  /** Searches one bounded page of the Codex plugin catalog. */
  async search(
    sourceId: string | null,
    searchTerm: string,
    cursor?: string | null,
    limit?: number
  ): Promise<OpenCodexPluginSearchResult> {
    return await this.service.search(sourceId, searchTerm, cursor, limit);
  }

  /** Explicitly refreshes the remote Codex plugin catalog. */
  async refresh(sourceId: string | null): Promise<OpenCodexPluginCatalogRefreshResult> {
    return await this.service.refresh(sourceId);
  }

  /** Reads detailed metadata for one plugin. */
  async read(target: PluginTarget): Promise<OpenCodexPluginDetail> {
    return await this.service.read(target);
  }

  /** Installs one plugin through a Codex source. */
  async install(target: PluginTarget): Promise<OpenCodexPluginInstallResult> {
    return await this.service.install(target);
  }

  /** Uninstalls one installed plugin. */
  async uninstall(sourceId: string | null, pluginId: string): Promise<{ ok: true }> {
    return await this.service.uninstall(sourceId, pluginId);
  }
}

type SearchApiService = Pick<ProjectSearchService, "searchProjectFiles" | "searchProjectSkills">;

/** Exposes project file and skill searches. */
export class SearchApi implements SearchApiContract {
  /** Creates a search API over the project search service. */
  constructor(private readonly service: SearchApiService) {}

  /** Searches project files through the selected Codex source. */
  async files(
    projectPath: string,
    sourceId: string | null,
    query: string,
    limit: number
  ): Promise<OpenCodexFileSearchResult[]> {
    return await this.service.searchProjectFiles(projectPath, sourceId, query, limit);
  }

  /** Searches Codex skills available for a project. */
  async skills(
    projectPath: string,
    sourceId: string | null,
    query: string,
    limit: number
  ): Promise<OpenCodexSkillSearchResult[]> {
    return await this.service.searchProjectSkills(projectPath, sourceId, query, limit);
  }
}

type HostApiService = Pick<
  HostIntegrationService,
  | "pickSourceExecutable"
  | "pickImageFiles"
  | "openLink"
  | "openProjectInIde"
  | "openProjectFolder"
  | "openProjectTerminal"
>;

/** Exposes host filesystem, picker, link, and process integrations. */
export class HostApi implements HostApiContract {
  /** Creates a host API over the host integration service. */
  constructor(private readonly service: HostApiService) {}

  /** Opens the host executable picker for source commands. */
  async pickExecutable(): Promise<string | null> {
    return await this.service.pickSourceExecutable();
  }

  /** Opens the host image picker. */
  async pickImages(): Promise<OpenCodexImageAttachment[]> {
    return await this.service.pickImageFiles();
  }

  /** Opens an external link through the host. */
  async openLink(
    href: string,
    projectPath: string | null,
    sourceId: string | null
  ): Promise<{ ok: true }> {
    return await this.service.openLink(href, projectPath, sourceId);
  }

  /** Opens a project folder through its configured source opener. */
  async openInIde(projectPath: string, sourceId: string | null): Promise<{ ok: true }> {
    return await this.service.openProjectInIde(projectPath, sourceId);
  }

  /** Opens a local project folder with the host file manager. */
  async openFolder(projectPath: string, sourceId: string | null): Promise<{ ok: true }> {
    return await this.service.openProjectFolder(projectPath, sourceId);
  }

  /** Opens a host terminal with a local project as its working directory. */
  async openTerminal(projectPath: string, sourceId: string | null): Promise<{ ok: true }> {
    return await this.service.openProjectTerminal(projectPath, sourceId);
  }
}

type ApprovalsApiService = Pick<ApprovalService, "resolveApproval">;

/** Exposes approval resolution to the UI boundary. */
export class ApprovalsApi implements ApprovalsApiContract {
  /** Creates an approvals API over the approval service. */
  constructor(private readonly service: ApprovalsApiService) {}

  /** Resolves a pending approval request. */
  resolve(approvalId: string, decision: OpenCodexApprovalDecision): void {
    this.service.resolveApproval(approvalId, decision);
  }
}

type SettingsApiSave = (settings: OpenCodexSettings) => Promise<void> | void;

/** Exposes settings reads and updates while preserving runtime normalization. */
export class SettingsApi implements SettingsApiContract {
  /** Creates a settings API over a mutable settings store and persistence callback. */
  constructor(
    private readonly settings: RuntimeSettingsPort,
    private readonly saveSettings?: SettingsApiSave
  ) {}

  /** Returns the current backend settings. */
  get(): OpenCodexSettings {
    return this.settings.getSettings();
  }

  /** Updates, normalizes, and persists backend settings. */
  async update(patch: Partial<OpenCodexSettings>): Promise<OpenCodexSettings> {
    const nextSettings = { ...this.settings.getSettings(), ...patch };

    if (!nextSettings.developerMode || !nextSettings.performanceMonitoringEnabled) {
      nextSettings.advancedPerformanceMonitoringEnabled = false;
    }

    this.settings.setSettings(nextSettings);
    await this.saveSettings?.(nextSettings);
    return nextSettings;
  }
}
