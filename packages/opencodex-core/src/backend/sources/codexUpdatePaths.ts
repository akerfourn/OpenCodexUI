/** Recognizes the managed standalone tree after resolution in the executable's own filesystem. */
export function isStandaloneCodexPath(value: string): boolean {
  return value.includes("/.codex/packages/standalone/")
    || value.includes("\\.codex\\packages\\standalone\\");
}
