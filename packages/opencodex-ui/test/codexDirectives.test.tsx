import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { parseCodexDirectives } from "../src/components/messages/codexDirectives";
import { createMarkdownRenderTree, MarkdownLinkContext } from "../src/components/messages/markdownRenderTree";
import { CodexFollowupContext } from "../src/components/messages/CodexFollowupContext";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

/** Exercises the real Markdown pipeline and current-context action resolution. */
function render(markdown: string, disabled = false): string {
  return renderToStaticMarkup(<MarkdownLinkContext.Provider value={{ requireModifiedClick: true, onOpenLink: vi.fn() }}>
    <CodexFollowupContext.Provider value={{ isSubmitting: disabled, suggestPrompt: vi.fn() }}>
      {createMarkdownRenderTree(markdown, "standard")}
    </CodexFollowupContext.Provider>
  </MarkdownLinkContext.Provider>);
}

describe("Codex presentation directives", () => {
  it("should render observed file citations and follow-up suggestions", () => {
    const html = render('Created :codex-file-citation[path="/project/out/patient-stats.xlsx" purpose="output"}.\n\n' +
      '- :codex-followup[Add charts]{prompt="Add charts to the workbook."}');
    expect(html).toContain('href="/project/out/patient-stats.xlsx"');
    expect(html).toContain("patient-stats.xlsx");
    expect(html).toContain("<button");
    expect(html).toContain("Add charts");
    expect(html).not.toContain(":codex-");
  });

  it("should identify suggestions with an AI icon without a hover tooltip", () => {
    const html = render(':codex-followup[Continue]{prompt="next"}');
    expect(html).toContain("AutoAwesomeOutlinedIcon");
    expect(html).not.toContain("MuiTooltip");
    expect(html).not.toContain('title="');
    expect(html).toContain('aria-description="message.useSuggestedPrompt');
  });

  it("should accept labelled citations and preserve Windows paths and quoted prompts", () => {
    expect(parseCodexDirectives(':codex-file-citation[Report]{path="C:\\reports\\out.xlsx"}')[0])
      .toMatchObject({ label: "Report", value: "C:\\reports\\out.xlsx" });
    expect(parseCodexDirectives(':codex-followup[Continue]{prompt="Write \\"hello\\" {again}."}')[0])
      .toMatchObject({ value: 'Write "hello" {again}.' });
  });

  it("should leave code examples, incomplete hints and unknown syntax literal", () => {
    for (const markdown of [
      '\\:codex-followup[Continue]{prompt="next"}',
      '` :codex-followup[Continue]{prompt="next"} `',
      '```md\n:codex-followup[Continue]{prompt="next"}\n```',
      ':codex-followup[Continue]{prompt="unfinished',
      ':codex-unknown[Something]{value="next"}'
    ]) {
      expect(render(markdown)).not.toContain("message.useSuggestedPrompt");
      expect(render(markdown)).toContain(":codex-");
    }
  });

  it("should reject executable schemes and escape labels instead of rendering HTML", () => {
    expect(parseCodexDirectives(':codex-file-citation{path="javascript:alert(1)"}')).toEqual([]);
    const html = render(':codex-followup[<img src=x onerror=alert(1)>]{prompt="next"}');
    expect(html).not.toContain("<img");
  });

  it("should use the current submitting state even when a Markdown tree is cached", () => {
    const text = ':codex-followup[Continue]{prompt="next"}';
    expect(render(text)).not.toContain('disabled=""');
    expect(render(text, true)).toContain('disabled=""');
  });
});
