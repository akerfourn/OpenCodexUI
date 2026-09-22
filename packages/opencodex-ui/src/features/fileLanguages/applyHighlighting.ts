/** Minimal model boundary; highlighting never writes document text or undo history. */
export interface HighlightingTarget {
  isDisposed(): boolean;
  setLanguage(id: string): void;
}

/** Returns a cancellation guard for stale document or preference completions. */
export function applyHighlighting(
  target: HighlightingTarget,
  language: string,
  load: (id: string) => Promise<void>,
  onError: (error: string) => void
): () => void {
  let cancelled = false;
  target.setLanguage("plaintext");
  if (language !== "plaintext") {
    void load(language).then(() => {
      if (!cancelled && !target.isDisposed()) target.setLanguage(language);
    }).catch(error => {
      if (!cancelled && !target.isDisposed()) onError(String(error));
    });
  }
  return () => { cancelled = true; };
}
