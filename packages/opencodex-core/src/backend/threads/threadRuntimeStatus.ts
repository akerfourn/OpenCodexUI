import type { OpenCodexThreadRuntimeStatus } from "@open-codex-ui/opencodex-protocol";

import { readObject, readString } from "../../mapping.js";

/**
 * Reads a normalized runtime status from Codex thread/read data.
 *
 * @param value Raw status payload.
 * @returns Protocol runtime status.
 */
export function readThreadRuntimeStatus(value: unknown): OpenCodexThreadRuntimeStatus["status"] {
  const statusObject = readObject(value);
  const objectStatus = readString(statusObject.type);

  if (isOpenCodexRuntimeStatus(objectStatus)) {
    return objectStatus;
  }

  const stringStatus = readString(value);

  if (isOpenCodexRuntimeStatus(stringStatus)) {
    return stringStatus;
  }

  return "unknown";
}

/**
 * Reads active runtime flags from Codex thread/read data.
 *
 * @param value Raw status payload.
 * @returns Active flag names.
 */
export function readThreadActiveFlags(value: unknown): string[] {
  const statusObject = readObject(value);
  const flags = statusObject.activeFlags;

  if (!Array.isArray(flags)) {
    return [];
  }

  return flags.filter((flag): flag is string => typeof flag === "string");
}

/**
 * Checks whether a string is a supported runtime status.
 *
 * @param value Status candidate.
 * @returns Whether the status is supported.
 */
function isOpenCodexRuntimeStatus(value: string): value is OpenCodexThreadRuntimeStatus["status"] {
  return (
    value === "active" ||
    value === "idle" ||
    value === "notLoaded" ||
    value === "systemError" ||
    value === "unknown"
  );
}
