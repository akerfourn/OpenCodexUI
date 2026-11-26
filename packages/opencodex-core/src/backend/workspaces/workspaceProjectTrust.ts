import { readObject } from "../../mapping.js";
import { normalizeWorkspaceSourcePath } from "./workspaceSourcePath.js";

/** Reads source-owned project trust using Windows path semantics and literal POSIX paths. */
export function isWorkspaceProjectTrusted(projects: unknown, projectPath: string): boolean {
  const target = projectTrustPathKey(projectPath);
  if (target === null) return false;

  let found = false;
  for (const [configuredPath, project] of Object.entries(readObject(projects))) {
    if (projectTrustPathKey(configuredPath) !== target) continue;
    // Conflicting aliases must never turn an explicit refusal into permission.
    if (readObject(project).trust_level !== "trusted") return false;
    found = true;
  }
  return found;
}

/** Ignores unsupported keys; POSIX names remain case-sensitive even on a Windows host. */
function projectTrustPathKey(value: string): string | null {
  if (value.startsWith("/")) return value;
  try {
    return normalizeWorkspaceSourcePath(value).replace(/\\+$/u, "").toLowerCase();
  } catch {
    // Relative or malformed configuration keys cannot establish source trust.
    return null;
  }
}
