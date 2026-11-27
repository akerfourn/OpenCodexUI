import { isDeepStrictEqual } from "node:util";
import type { CodexAppServerClient, v2 } from "@open-codex-ui/codex-rpc";
import { readObject } from "../../mapping.js";
import { buildManagedConfigBlock, buildManagedPermissionProfile, replaceManagedBlock, joinSourcePath,
  type ManagedConfigBlockInput } from "../projects/projectContextConfig.js";
import { isMissingWorkspacePathError } from "./workspaceSourcePath.js";

/** Writes only the owned config block and verifies the complete source-loaded policy. */
export async function writeWorkspacePermissionConfiguration(
  client: CodexAppServerClient, input: ManagedConfigBlockInput
): Promise<void> {
  const profile = buildManagedPermissionProfile(input);
  const metadata = await client.getMetadata(input.projectPath);
  if (metadata.isDirectory !== true) {
    throw new Error("Destination workspace is not an available directory.");
  }
  const directory = joinSourcePath(input.projectPath, ".codex");
  const configPath = joinSourcePath(directory, "config.toml");
  for (const value of [directory, configPath]) {
    try {
      const metadata = await client.getMetadata(value);
      if (metadata.isSymlink !== false) throw new Error("Workspace configuration must not use symbolic links.");
    } catch (error) {
      if (!isMissingWorkspacePathError(error, value)) throw error;
    }
  }
  await client.createDirectory(directory);
  let previous = "";
  try {
    previous = Buffer.from((await client.readFile(configPath)).dataBase64, "base64").toString("utf8");
  } catch (error) {
    if (!isMissingWorkspacePathError(error, configPath)) throw error;
  }
  const next = replaceManagedBlock(previous, buildManagedConfigBlock(input), input.profileId);
  if (next !== previous) {
    await client.writeFile(configPath, Buffer.from(next, "utf8").toString("base64"));
  }
  const effective = await client.request<v2.ConfigReadResponse>("config/read", { cwd: input.projectPath });
  const loaded = normalizeLoadedProfile(readObject(effective.config.permissions)[input.profileId]);
  if (effective.config.default_permissions !== input.profileId || !isDeepStrictEqual(loaded, profile)) {
    const expected = readObject(profile);
    const fields = new Set([...Object.keys(expected), ...Object.keys(loaded)]);
    const differences = [...fields].filter(key => !isDeepStrictEqual(expected[key], loaded[key])).sort();
    const differingFields = differences.length === 0 ? "none" : differences.join(", ");
    throw new Error(`Codex did not load the exact destination permission profile [${configPath}]. ` +
      `Expected default_permissions=${JSON.stringify(input.profileId)}, ` +
      `loaded=${JSON.stringify(effective.config.default_permissions ?? null)}; ` +
      `differing profile fields: ${differingFields}. Check project trust and overrides.`);
  }
}

/** Codex serializes these optional schema fields as null when they are absent from TOML. */
function normalizeLoadedProfile(value: unknown): Record<string, unknown> {
  const profile = structuredClone(readObject(value));
  if (profile.credentials === null) {
    delete profile.credentials;
  }
  const filesystem = readObject(profile.filesystem);
  if (filesystem.glob_scan_max_depth === null) {
    delete filesystem.glob_scan_max_depth;
  }
  profile.filesystem = filesystem;
  const network = readObject(profile.network);
  const optional = ["proxy_url", "enable_socks5", "transparent_tcp", "socks_url", "enable_socks5_udp", "allow_upstream_proxy",
    "dangerously_allow_non_loopback_proxy", "dangerously_allow_all_unix_sockets", "mode", "domains",
    "unix_sockets", "allow_local_binding", "mitm"];
  for (const key of optional) {
    if (network[key] === null) {
      delete network[key];
    }
  }
  profile.network = network;
  return profile;
}
