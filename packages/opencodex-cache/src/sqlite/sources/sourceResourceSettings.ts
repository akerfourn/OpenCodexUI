import { validateSourceResources } from "@open-codex-ui/opencodex-protocol";
import type { CachedSourceKind, CachedSourceLocalSettings } from "../../types.js";

/** Copies an entire local policy, rejecting unsupported source kinds and malformed writes. */
export function sourceResourcePatch(
  kind: CachedSourceKind,
  value: unknown
): Pick<CachedSourceLocalSettings, "resources"> {
  if (value === undefined) return {};
  if (kind !== "local") throw new Error("Resource controls are supported only for local sources.");
  validateSourceResources(value);
  return { resources: { priority: value.priority, cpuLimitPercent: value.cpuLimitPercent } };
}

/** Older databases need no migration; corrupt optional policies retain other source settings. */
export function parseSourceResourceSettings(value: unknown): Pick<CachedSourceLocalSettings, "resources"> {
  try {
    return sourceResourcePatch("local", value);
  } catch {
    return {};
  }
}
