/** Clones arbitrary details into JSON-compatible data for transport boundaries. */
export function cloneJsonValue(value: unknown): unknown {
  if (value === undefined || value === null) {
    return value ?? null;
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined ? null : JSON.parse(serialized) as unknown;
  } catch {
    try {
      return String(value);
    } catch {
      return "[unserializable log details]";
    }
  }
}

/** Estimates serialized UTF-8 size without retaining the serialized payload. */
export function estimateJsonBytes(value: unknown): number {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    return 0;
  }

  return Buffer.byteLength(serialized, "utf8");
}
