/** Sanitizes persisted identifiers without depending on a particular UI catalogue version. */
export function normalizeDisabledFileLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = value.filter((id): id is string =>
    typeof id === "string" && /^[a-z0-9][a-z0-9+._-]{0,79}$/.test(id));
  return [...new Set(ids)].sort().slice(0, 1000);
}
