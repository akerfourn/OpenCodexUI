import { useEffect, useState } from "react";
import { DICTATION_MAX_SECONDS } from "@open-codex-ui/opencodex-protocol";

/** Refreshes the recording indicator without adding timers to the shared store. */
export function useDictationProgress(startedAt: number | null): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (startedAt === null) return;
    setNow(performance.now());
    const timer = window.setInterval(() => setNow(performance.now()), 250);
    return () => window.clearInterval(timer);
  }, [startedAt]);
  if (startedAt === null) return 0;
  return Math.min(DICTATION_MAX_SECONDS, Math.max(0, (now - startedAt) / 1000));
}

/** Formats elapsed capture time for the microphone tooltip. */
export function formatDictationDuration(seconds: number): string {
  const wholeSeconds = Math.floor(seconds);
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}
