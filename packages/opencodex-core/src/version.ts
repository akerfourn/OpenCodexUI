/**
 * Reads whether an application version represents a pre-release build.
 *
 * @param version Application version reported by Electron.
 * @returns `true` when the semantic version contains a pre-release suffix.
 */
export function isPrereleaseVersion(version: string | null | undefined): boolean {
  const normalizedVersion = version?.trim() ?? "";

  if (normalizedVersion.length === 0) {
    return false;
  }

  const versionWithoutBuildMetadata = normalizedVersion.split("+", 1)[0] ?? "";
  return versionWithoutBuildMetadata.indexOf("-") > 0;
}
