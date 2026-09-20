import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DictationStore } from "../src/stores/app/DictationStore";
import { ComposerDictation } from "../src/components/chat/ComposerDictation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { elapsed: string; limit: string }) => {
      if (values) return `${key} ${values.elapsed} / ${values.limit}`;
      return key;
    },
  }),
}));

/** Renders each microphone state without requesting audio access. */
function render(status: DictationStore["status"], startedAt: number | null = null): string {
  const dictation = {
    settings: { enabled: true }, status, recordingStartedAt: startedAt,
    busy: status !== "idle", managing: false,
  } as DictationStore;
  return renderToStaticMarkup(
    <ComposerDictation dictation={dictation} sourceId="source" composerId="chat" disabled={false} onText={vi.fn()} />,
  );
}

describe("compact dictation feedback", () => {
  afterEach(() => vi.restoreAllMocks());

  it("should show just the microphone when idle", () => {
    const markup = render("idle");
    expect(markup).toContain('aria-label="dictation.start"');
    expect(markup).not.toContain('role="progressbar"');
    expect(markup).not.toContain('aria-label="dictation.cancel"');
  });

  it("should show elapsed recording progress and retain the microphone and cancellation", () => {
    vi.spyOn(performance, "now").mockReturnValue(61000);
    const markup = render("recording", 1000);
    expect(markup).toContain('aria-valuenow="50"');
    expect(markup).toContain('aria-label="dictation.recordingProgress 1:00 / 2:00"');
    expect(markup).toContain('data-testid="MicRoundedIcon"');
    expect(markup).toContain('aria-label="dictation.cancel"');
    expect(markup).not.toContain(">dictation.");
  });

  it("should clamp progress at the recording limit", () => {
    vi.spyOn(performance, "now").mockReturnValue(180000);
    const markup = render("recording", 0);
    expect(markup).toContain('aria-valuenow="100"');
    expect(markup).toContain('aria-label="dictation.recordingProgress 2:00 / 2:00"');
  });

  it("should show indeterminate transcription with a disabled microphone and no visible status text", () => {
    const markup = render("transcribing", 1000);
    expect(markup).toContain('role="progressbar"');
    expect(markup).not.toContain("aria-valuenow");
    expect(markup).toContain('aria-label="dictation.transcribing"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('data-testid="MicRoundedIcon"');
    expect(markup).not.toContain(">dictation.");
  });

  it("should show indeterminate microphone access without claiming to record yet", () => {
    const markup = render("requesting");
    expect(markup).toContain('aria-label="dictation.requesting"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).not.toContain("aria-valuenow");
  });
});
