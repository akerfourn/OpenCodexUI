import type {
  OpenCodexProjectContextFolder,
  OpenCodexProjectContextFolderPermission,
  OpenCodexProjectContextEnvFilePermission
} from "@open-codex-ui/opencodex-protocol";

const defaultProfileId = "opencodex-context";
const defaultContextFolderPermission: OpenCodexProjectContextFolderPermission = "read";
const defaultEnvFilePermission: OpenCodexProjectContextEnvFilePermission = "deny";
const defaultBlockStart = "# BEGIN OpenCodexUI managed default permissions";
const defaultBlockEnd = "# END OpenCodexUI managed default permissions";
const blockStart = "# BEGIN OpenCodexUI managed context permissions";
const blockEnd = "# END OpenCodexUI managed context permissions";

/** Inputs shared by legacy context sync and workspace-specific preparation. */
export interface ManagedConfigBlockInput {
  /** Directory receiving workspace write permission. */
  projectPath: string;
  /** Explicit shared folders and their environment-file restrictions. */
  externalFolders: Array<Pick<OpenCodexProjectContextFolder, "path" | "permission" | "envFilePermission">>;
  /** Named profile written into the managed block. */
  profileId: string;
  /** Omitted preserves the legacy built-in temporary-directory permissions. */
  restrictTemporaryDirectories?: boolean;
  /** Omitted preserves the built-in network policy. */
  networkAccess?: boolean;
}

/** Structured profile used both for TOML generation and effective-config verification. */
export interface ManagedPermissionProfile {
  /** Description displayed by Codex's profile catalogue. */
  description: string;
  /** Explicit supported built-in base. */
  extends: ":workspace";
  /** Absolute project roots; shared folders use explicit filesystem rules. */
  workspace_roots: Record<string, boolean>;
  /** Filesystem rules including restrictions on shared environment files. */
  filesystem: Record<string, "read" | "write" | "deny">;
  /** Optional explicit network policy. */
  network?: { enabled: boolean };
}

/** Builds one permission definition without filesystem or configuration side effects. */
export function buildManagedPermissionProfile(input: ManagedConfigBlockInput): ManagedPermissionProfile {
  const folders = input.externalFolders.filter((folder, index, all) =>
    folder.path !== input.projectPath && all.findIndex((candidate) => candidate.path === folder.path) === index);
  const filesystem: ManagedPermissionProfile["filesystem"] = {};
  if (input.restrictTemporaryDirectories === true) {
    filesystem[":tmpdir"] = "read";
    filesystem[":slash_tmp"] = "read";
  }
  for (const folder of folders) {
    filesystem[folder.path] = normalizeContextFolderPermission(folder.permission);
  }
  for (const folder of folders) {
    const permission = normalizeContextFolderPermission(folder.permission);
    filesystem[joinSourcePath(folder.path, "**", "*.env")] =
      normalizeEnvFilePermission(folder.envFilePermission, permission);
  }
  const result: ManagedPermissionProfile = {
    description: "OpenCodexUI project context.", extends: ":workspace",
    workspace_roots: { [input.projectPath]: true }, filesystem
  };
  if (input.networkAccess !== undefined) {
    result.network = { enabled: input.networkAccess };
  }
  return result;
}

/** Renders the same structured policy that the backend later verifies through config/read. */
export function buildManagedConfigBlock(input: ManagedConfigBlockInput): string {
  const profile = buildManagedPermissionProfile(input);
  const lines = [blockStart, `[permissions.${input.profileId}]`,
    `description = ${JSON.stringify(profile.description)}`, `extends = ":workspace"`, "",
    `[permissions.${input.profileId}.workspace_roots]`];
  for (const [root, enabled] of Object.entries(profile.workspace_roots)) {
    lines.push(`${quoteTomlKey(root)} = ${enabled}`);
  }
  lines.push("", `[permissions.${input.profileId}.filesystem]`);
  for (const [file, access] of Object.entries(profile.filesystem)) {
    lines.push(`${quoteTomlKey(file)} = "${access}"`);
  }
  if (profile.network !== undefined) {
    lines.push("", `[permissions.${input.profileId}.network]`, `enabled = ${profile.network.enabled}`);
  }
  lines.push(blockEnd, "");
  return lines.join("\n");
}

/**
 * Replaces OpenCodexUI-managed blocks while preserving user config.
 *
 * @param config Existing `config.toml` content.
 * @param block Newly generated managed profile block.
 * @param profileId Managed profile id.
 * @returns Updated config content.
 * @throws When unmanaged config already owns the same profile/default permissions.
 */
export function replaceManagedBlock(config: string, block: string, profileId: string): string {
  const withoutManagedBlock = removeManagedDefaultBlock(removeManagedBlock(config));

  if (containsUnmanagedProfile(withoutManagedBlock, profileId)) {
    throw new Error(`Codex permissions profile "${profileId}" already exists outside OpenCodexUI managed block.`);
  }

  if (containsUnmanagedDefaultPermissions(withoutManagedBlock)) {
    throw new Error("Codex default_permissions already exists outside OpenCodexUI managed block.");
  }

  const withDefaultPermissions = insertManagedDefaultBlock(withoutManagedBlock, profileId);
  const normalizedConfig = withDefaultPermissions.trimEnd();

  if (normalizedConfig.length === 0) {
    return block;
  }

  return `${normalizedConfig}\n\n${block}`;
}

/**
 * Inserts the managed `default_permissions` block before TOML tables.
 *
 * @param config Existing config without managed default block.
 * @param profileId Managed profile id.
 * @returns Config with managed default permissions.
 */
function insertManagedDefaultBlock(config: string, profileId: string): string {
  const block = [
    defaultBlockStart,
    `default_permissions = ${JSON.stringify(profileId)}`,
    defaultBlockEnd
  ].join("\n");
  const insertionIndex = findFirstTableIndex(config);

  if (config.trim().length === 0) {
    return `${block}\n`;
  }

  if (insertionIndex === -1) {
    return `${config.trimEnd()}\n\n${block}\n`;
  }

  const beforeTables = config.slice(0, insertionIndex).trimEnd();
  const tables = config.slice(insertionIndex).trimStart();

  if (beforeTables.length === 0) {
    return `${block}\n\n${tables}`;
  }

  return `${beforeTables}\n\n${block}\n\n${tables}`;
}

/**
 * Removes the managed context-permissions block from config content.
 *
 * @param config Existing config content.
 * @returns Config without the managed context block.
 */
function removeManagedBlock(config: string): string {
  const startIndex = config.indexOf(blockStart);
  const endIndex = config.indexOf(blockEnd);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return config;
  }

  return `${config.slice(0, startIndex)}${config.slice(endIndex + blockEnd.length)}`;
}

/**
 * Removes the managed default-permissions block from config content.
 *
 * @param config Existing config content.
 * @returns Config without the managed default block.
 */
function removeManagedDefaultBlock(config: string): string {
  const startIndex = config.indexOf(defaultBlockStart);
  const endIndex = config.indexOf(defaultBlockEnd);

  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return config;
  }

  return `${config.slice(0, startIndex)}${config.slice(endIndex + defaultBlockEnd.length)}`;
}

/**
 * Checks whether a profile id is already defined outside managed blocks.
 *
 * @param config Config content without OpenCodexUI-managed blocks.
 * @param profileId Profile id to check.
 * @returns Whether the user already owns that profile.
 */
function containsUnmanagedProfile(config: string, profileId: string): boolean {
  const escapedProfileId = escapeRegExp(profileId);
  const pattern = new RegExp(`^\\s*\\[permissions\\.${escapedProfileId}(?:\\]|\\.)`, "m");
  return pattern.test(config);
}

/**
 * Checks whether root-level default permissions are user-managed.
 *
 * @param config Config content without OpenCodexUI-managed blocks.
 * @returns Whether unmanaged `default_permissions` exists.
 */
function containsUnmanagedDefaultPermissions(config: string): boolean {
  const firstTableIndex = findFirstTableIndex(config);
  const rootConfig = firstTableIndex === -1 ? config : config.slice(0, firstTableIndex);

  return /^\s*default_permissions\s*=/m.test(rootConfig);
}

/**
 * Finds the first TOML table declaration.
 *
 * @param config Config content.
 * @returns Character index, or -1 when no table exists.
 */
function findFirstTableIndex(config: string): number {
  const match = /^\s*\[[^\]]+\]/m.exec(config);
  return match?.index ?? -1;
}

/**
 * Normalizes a configured profile id with the project default fallback.
 *
 * @param value Optional profile id.
 * @returns Non-empty profile id.
 */
export function normalizeProfileId(value: string | null | undefined): string {
  const normalized = value?.trim();
  return normalized !== undefined && normalized.length > 0 ? normalized : defaultProfileId;
}

/**
 * Normalizes the permission applied to external context `.env` files.
 *
 * @param value Optional permission value.
 * @returns A supported permission, defaulting to deny.
 */
function normalizeContextFolderPermission(
  value: OpenCodexProjectContextFolderPermission | null | undefined
): OpenCodexProjectContextFolderPermission {
  return value === "write" ? value : defaultContextFolderPermission;
}

/**
 * Normalizes the permission applied to external context `.env` files.
 *
 * @param value Optional permission value.
 * @param folderPermission Permission applied to the containing folder.
 * @returns A supported permission compatible with the containing folder.
 */
function normalizeEnvFilePermission(
  value: OpenCodexProjectContextEnvFilePermission | null | undefined,
  folderPermission: OpenCodexProjectContextFolderPermission
): OpenCodexProjectContextEnvFilePermission {
  if (value === "write" && folderPermission === "read") {
    return defaultEnvFilePermission;
  }

  return value === "read" || value === "write" ? value : defaultEnvFilePermission;
}

/**
 * Quotes an arbitrary path as a TOML key.
 *
 * @param value Raw key.
 * @returns JSON/TOML-compatible quoted key.
 */
function quoteTomlKey(value: string): string {
  return JSON.stringify(value);
}

/**
 * Joins source-local path segments using the source path style.
 *
 * @param root Source-local root path.
 * @param parts Child path segments.
 * @returns Joined source-local path.
 */
export function joinSourcePath(root: string, ...parts: string[]): string {
  const separator = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  const normalizedRoot = root.replace(/[\\/]+$/, "");
  return [normalizedRoot, ...parts].join(separator);
}

/**
 * Escapes a string for safe RegExp interpolation.
 *
 * @param value Raw string.
 * @returns Escaped regex fragment.
 */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
