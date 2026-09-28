import { renderToStaticMarkup } from "react-dom/server";
import { createTheme, ThemeProvider } from "@mui/material";
import { describe, expect, it, vi } from "vitest";
import { FileMarkdownContent } from "../src/components/files/FileMarkdownContent";
import { splitMarkdownFrontmatter } from "../src/components/files/splitMarkdownFrontmatter";
import { MarkdownMessage } from "../src/components/messages/MarkdownMessage";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("Markdown metadata and headings", () => {
  it("should separate leading YAML without changing indentation, lists or the remaining document", () => {
    const yaml = 'ticket: 1051\nstate: open\ntags:\n  - feature\n  - frontend\n';
    const body = '\n# Title\n\n---\n\n## Analysis';
    expect(splitMarkdownFrontmatter(`---\n${yaml}---\n${body}`)).toEqual({ yaml, markdown: body });
  });

  it("should recognize a BOM, Windows line endings and the YAML end marker", () => {
    expect(splitMarkdownFrontmatter('\uFEFF---\r\nname: example\r\n...\r\n# Title'))
      .toEqual({ yaml: 'name: example\r\n', markdown: '# Title' });
    expect(splitMarkdownFrontmatter('---\nname: example\n---'))
      .toEqual({ yaml: 'name: example\n', markdown: '' });
  });

  it.each(['# Title\n\n---\ntext\n---', '---\nunfinished: true', '```yaml\n---\nkey: value\n---\n```'])(
    "should leave non-leading or incomplete metadata untouched: %s", content => {
      expect(splitMarkdownFrontmatter(content)).toEqual({ yaml: null, markdown: content });
    }
  );

  it.each(["light", "dark"] as const)("should render literal metadata separately with larger H1 headings in %s mode", mode => {
    const content = '---\nticket: 1051\ntags:\n  - feature\nunsafe: <script>alert(1)</script>\n---\n# Main title\n\n## Analysis';
    const markup = renderToStaticMarkup(<ThemeProvider theme={createTheme({ palette: { mode } })}>
      <section><article><FileMarkdownContent content={content} /></article></section>
    </ThemeProvider>);
    expect(markup).toContain('<details');
    expect(markup).toContain('files.frontmatter');
    expect(markup).toContain('tags:\n  - feature');
    expect(markup).not.toContain('<script>');
    expect(markup).not.toContain('<hr');
    expect(markup).toContain('<h1 id="file-markdown-main-title">Main title</h1>');
    expect(markup).toContain('h1{font-size:2em;}');
    expect(markup).toContain('h2{font-size:1.5em;}');
  });

  it("should apply the same explicit heading hierarchy inside nested chat sections", () => {
    const markup = renderToStaticMarkup(<section><article>
      <MarkdownMessage markdown={'# Main title\n\n## Section\n\n### Subsection'} onOpenLink={vi.fn()} />
    </article></section>);
    expect(markup).toContain('<h1>Main title</h1>');
    expect(markup).toContain('h1{font-size:2em;}');
    expect(markup).toContain('h2{font-size:1.5em;}');
    expect(markup).toContain('h3{font-size:1.25em;}');
  });
});
