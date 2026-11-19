/** Explicit renderer boundary for local failures; backend rejections are already journaled. */
export class ApplicationErrorReporter {
  /** Error identities prevent nested catches from journaling the same failure twice. */
  private readonly reported = new WeakSet<object>();

  /** Keeps notifications independent from best-effort journal persistence. */
  constructor(private readonly notify: (message: string) => void,
    private readonly persist: (message: string, details: { stack?: string; context?: string }) => Promise<unknown>) {}

  /** Marks backend rejections whose reporting is owned by the request router. */
  markReported(error: unknown): void {
    if (typeof error === "object" && error !== null) this.reported.add(error);
  }

  /** Reports a local failure once without allowing journal failures to recurse. */
  report(error: unknown, context?: string): void {
    if (typeof error === "object" && error !== null && this.reported.has(error)) return;
    this.markReported(error);
    const message = error instanceof Error ? error.message : String(error);
    const details = { stack: error instanceof Error ? error.stack : undefined, context };
    this.notify(message);
    void this.persist(message, details).catch(() => undefined);
  }
}
