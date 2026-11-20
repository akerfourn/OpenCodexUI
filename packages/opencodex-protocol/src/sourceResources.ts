/** Scheduling policy shared by a local app-server and its child processes. */
export interface SourceResourceSettings {
  priority: "normal" | "low" | "idle";
  /** Percentage of the host's available CPU capacity, shared by the process group. */
  cpuLimitPercent: number | null;
}

/** Host capabilities are detected without starting a Codex source. */
export interface SourceResourceCapabilities {
  priority: boolean;
  cpuLimit: boolean;
  cpuLimitUnavailableReason: "systemdUnavailable" | "windowsUnavailable" | "platformUnsupported" | null;
}

/** Explicit source settings and the controls this host can enforce. */
export interface SourceResourceSnapshot {
  settings: SourceResourceSettings;
  capabilities: SourceResourceCapabilities;
}

/** Returns fresh defaults so callers never share mutable configuration. */
export function defaultSourceResources(): SourceResourceSettings {
  return { priority: "normal", cpuLimitPercent: null };
}

/** Rejects malformed transport or persisted policies before they reach OS launchers. */
export function validateSourceResources(value: unknown): asserts value is SourceResourceSettings {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Invalid source resource settings.");
  }
  const { priority, cpuLimitPercent } = value as Record<string, unknown>;
  if (priority !== "normal" && priority !== "low" && priority !== "idle") {
    throw new Error("Source priority must be normal, low or idle.");
  }
  if (cpuLimitPercent !== null && (typeof cpuLimitPercent !== "number"
    || !Number.isInteger(cpuLimitPercent) || cpuLimitPercent < 1 || cpuLimitPercent > 100)) {
    throw new Error("The CPU limit must be null or an integer between 1 and 100 percent.");
  }
}
