/**
 * Stores bounded Markdown render trees between chat remounts.
 */

const MARKDOWN_RENDER_CACHE_VERSION = "markdown-render-v1";
const MAX_MARKDOWN_RENDER_CACHE_ENTRIES = 32;
const MAX_MARKDOWN_RENDER_CACHE_CHARACTERS = 2 * 1024 * 1024;

type MarkdownRenderCacheEntry<T> = {
  value: T;
  sourceLength: number;
};

const renderCache = new Map<string, MarkdownRenderCacheEntry<unknown>>();
let cachedCharacterCount = 0;

/**
 * Reads or creates one cached render result using least-recently-used order.
 *
 * @param variant Renderer variant, included in the cache key.
 * @param sourceLength Source length used for the bounded cache budget.
 * @param create Creates the render result on a cache miss.
 * @returns Cached or newly created render result.
 */
export function getCachedMarkdownRender<T>(
  variant: string,
  sourceLength: number,
  create: () => T
): T {
  const cacheKey = `${MARKDOWN_RENDER_CACHE_VERSION}\u0000${variant}`;
  const cachedEntry = renderCache.get(cacheKey) as MarkdownRenderCacheEntry<T> | undefined;

  if (cachedEntry !== undefined) {
    renderCache.delete(cacheKey);
    renderCache.set(cacheKey, cachedEntry);
    return cachedEntry.value;
  }

  const value = create();

  if (sourceLength > MAX_MARKDOWN_RENDER_CACHE_CHARACTERS) {
    return value;
  }

  renderCache.set(cacheKey, { value, sourceLength });
  cachedCharacterCount += sourceLength;
  evictOldestEntries();

  return value;
}

/**
 * Clears all cached Markdown render trees.
 *
 * This is primarily useful for tests and renderer configuration changes.
 */
export function clearMarkdownRenderCache(): void {
  renderCache.clear();
  cachedCharacterCount = 0;
}

/**
 * Returns the current number of cached render trees.
 *
 * @returns Number of entries retained by the cache.
 */
export function getMarkdownRenderCacheEntryCount(): number {
  return renderCache.size;
}

/** Evicts the oldest entries until both cache budgets are satisfied. */
function evictOldestEntries(): void {
  while (
    renderCache.size > MAX_MARKDOWN_RENDER_CACHE_ENTRIES
    || cachedCharacterCount > MAX_MARKDOWN_RENDER_CACHE_CHARACTERS
  ) {
    const oldestKey = renderCache.keys().next().value as string | undefined;

    if (oldestKey === undefined) {
      return;
    }

    const oldestEntry = renderCache.get(oldestKey);
    renderCache.delete(oldestKey);

    if (oldestEntry !== undefined) {
      cachedCharacterCount -= oldestEntry.sourceLength;
    }
  }
}
