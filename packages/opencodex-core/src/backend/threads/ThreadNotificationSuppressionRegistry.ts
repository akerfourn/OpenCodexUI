/**
 * Tracks threads whose transient runtime notifications must be suppressed.
 */
export class ThreadNotificationSuppressionRegistry {
  /** Suppressed thread identifiers. */
  private readonly threadIds = new Set<string>();

  /** Adds a thread to the suppression registry. */
  ignore(threadId: string): void {
    this.threadIds.add(threadId);
  }

  /** Removes a thread from the suppression registry. */
  release(threadId: string): void {
    this.threadIds.delete(threadId);
  }

  /** Returns whether a thread is currently suppressed. */
  has(threadId: string): boolean {
    return this.threadIds.has(threadId);
  }
}
