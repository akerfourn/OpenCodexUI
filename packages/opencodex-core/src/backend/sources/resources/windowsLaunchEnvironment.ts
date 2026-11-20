/** Private transport variable consumed by the resource launcher, never forwarded to Codex. */
export const windowsResourcePayloadVariable = "OPENCODEX_RESOURCE_LAUNCH";

/** Original child environment and a separate environment for the Windows PowerShell bridge. */
export interface WindowsLaunchEnvironment {
  environmentBlock: string;
  launcherEnvironment: NodeJS.ProcessEnv;
}

/**
 * Captures the host before PowerShell startup can rewrite variables. Windows blocks use
 * case-insensitive ordering; duplicate spellings follow Node's first lexicographic key rule.
 */
export function captureWindowsLaunchEnvironment(environment: NodeJS.ProcessEnv): WindowsLaunchEnvironment {
  const variables = new Map<string, [string, string]>();
  for (const name of Object.keys(environment).sort()) {
    const value = environment[name];
    const canonicalName = name.toUpperCase();
    const isPrivate = canonicalName === windowsResourcePayloadVariable || canonicalName.startsWith(`${windowsResourcePayloadVariable}_`);
    if (value === undefined || isPrivate || variables.has(canonicalName)) continue;
    variables.set(canonicalName, [name, value]);
  }
  const ordered = [...variables.keys()].sort().map(name => variables.get(name)!);
  const environmentBlock = ordered.map(([name, value]) => `${name}=${value}`).join("\0") + "\0\0";
  // PS7 module paths can break Add-Type/ConvertFrom-Json in the Windows PowerShell 5 bridge.
  // Keep the original value in Codex's block; let only the bridge build its own module path.
  const launcherEnvironment = Object.fromEntries(ordered.filter(([name]) => name.toUpperCase() !== "PSMODULEPATH"));
  return { environmentBlock, launcherEnvironment };
}

/** Keeps each transport variable below Windows' per-variable limit, even with large developer environments. */
export function windowsResourcePayloadEnvironment(payload: string): Record<string, string> {
  const chunkSize = 8_000;
  if (payload.length <= chunkSize) return { [windowsResourcePayloadVariable]: payload };
  // ASCII transport avoids splitting a UTF-16 surrogate pair across environment variables.
  const encoded = Buffer.from(payload, "utf8").toString("base64");
  const chunkCount = Math.ceil(encoded.length / chunkSize);
  const environment: Record<string, string> = { [windowsResourcePayloadVariable]: JSON.stringify({ chunkCount }) };
  for (let index = 0; index < chunkCount; index += 1) {
    environment[`${windowsResourcePayloadVariable}_${index}`] = encoded.slice(index * chunkSize, (index + 1) * chunkSize);
  }
  return environment;
}
