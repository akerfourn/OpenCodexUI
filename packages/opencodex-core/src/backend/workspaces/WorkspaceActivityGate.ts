/** Prevents lifecycle mutations racing in-flight tool requests in the same source. */
export class WorkspaceActivityGate {
  /** Short-lived source operations, including commands before their handles are registered. */
  private readonly readers = new Map<string, number>();
  /** Exclusive lifecycle operations; durable journals outlive this process-local guard. */
  private readonly writers = new Set<string>();

  /** Captures activity synchronously before dispatching an asynchronous source operation. */
  async run<T>(sourceId: string | null, action: () => Promise<T>): Promise<T> {
    if (sourceId === null) return await action();
    if (this.writers.has(sourceId)) throw new Error("A workspace removal is running on this source.");
    this.readers.set(sourceId, (this.readers.get(sourceId) ?? 0) + 1);
    try {
      return await action();
    } finally {
      const remaining = (this.readers.get(sourceId) ?? 1) - 1;
      if (remaining === 0) this.readers.delete(sourceId);
      else this.readers.set(sourceId, remaining);
    }
  }

  /** Fails rather than waiting indefinitely for a source operation or another removal. */
  async exclusive<T>(sourceId: string, action: () => Promise<T>): Promise<T> {
    if (this.writers.has(sourceId) || (this.readers.get(sourceId) ?? 0) > 0) {
      throw new Error("This source is processing another operation. Retry workspace removal when it finishes.");
    }
    this.writers.add(sourceId);
    try {
      return await action();
    } finally {
      this.writers.delete(sourceId);
    }
  }
}
