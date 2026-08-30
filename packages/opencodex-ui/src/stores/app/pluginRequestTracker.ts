/** Tracks plugin requests without making transport bookkeeping observable. */
export class PluginRequestTracker {
  private installedRequestId = 0;
  private catalogRequestId = 0;
  private refreshRequestId = 0;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  /** Starts a new installed-plugin request. */
  beginInstalled(): number {
    this.installedRequestId += 1;
    return this.installedRequestId;
  }

  /** Returns whether an installed-plugin request is still the latest. */
  isCurrentInstalled(requestId: number): boolean {
    return requestId === this.installedRequestId;
  }

  /** Validates an installed response against current source identity. */
  matchesInstalled(
    requestId: number,
    requestSourceId: string,
    selectedSourceId: string | null,
    resultSourceId: string | null
  ): boolean {
    return this.isCurrentInstalled(requestId) &&
      requestSourceId === selectedSourceId &&
      resultSourceId === requestSourceId;
  }

  /** Starts a new catalog request. */
  beginCatalog(): number {
    this.catalogRequestId += 1;
    return this.catalogRequestId;
  }

  /** Invalidates the current catalog request. */
  invalidateCatalog(): void {
    this.catalogRequestId += 1;
  }

  /** Returns whether a catalog request is still the latest. */
  isCurrentCatalog(requestId: number): boolean {
    return requestId === this.catalogRequestId;
  }

  /** Validates a catalog response against current source and search identity. */
  matchesCatalog(
    requestId: number,
    requestSourceId: string,
    selectedSourceId: string | null,
    requestSearchTerm: string,
    selectedSearchTerm: string,
    resultSourceId: string | null
  ): boolean {
    return this.isCurrentCatalog(requestId) &&
      requestSourceId === selectedSourceId &&
      resultSourceId === requestSourceId &&
      requestSearchTerm === selectedSearchTerm;
  }

  /** Starts a new explicit catalog refresh. */
  beginRefresh(): number {
    this.refreshRequestId += 1;
    return this.refreshRequestId;
  }

  /** Returns whether an explicit refresh is still the latest. */
  isCurrentRefresh(requestId: number): boolean {
    return requestId === this.refreshRequestId;
  }

  /** Validates an explicit refresh against current source identity. */
  matchesRefresh(
    requestId: number,
    requestSourceId: string,
    selectedSourceId: string | null
  ): boolean {
    return this.isCurrentRefresh(requestId) && requestSourceId === selectedSourceId;
  }

  /** Schedules one debounced search after clearing the previous callback. */
  scheduleSearch(delayMs: number, callback: () => void): void {
    this.clearScheduledSearch();
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      callback();
    }, delayMs);
  }

  /** Clears a pending debounced search. */
  clearScheduledSearch(): void {
    if (this.searchTimer !== null) {
      clearTimeout(this.searchTimer);
      this.searchTimer = null;
    }
  }

  /** Invalidates every request before selected source state is replaced. */
  invalidateAll(): void {
    this.installedRequestId += 1;
    this.catalogRequestId += 1;
    this.refreshRequestId += 1;
    this.clearScheduledSearch();
  }
}
