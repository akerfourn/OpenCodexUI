import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FileMarkdownContent } from "../src/components/files/FileMarkdownContent";
import { FileMarkdownImageProvider } from "../src/components/files/FileMarkdownImageProvider";
import { MarkdownMessage } from "../src/components/messages/MarkdownMessage";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

/** Exercises the production parser, sanitizer, URL filter and React components together. */
function render(content: string): string {
  return renderToStaticMarkup(<FileMarkdownContent content={content} />);
}

describe("HTML in Markdown document previews", () => {
  it("should preserve README logo alignment and resolve local images through the document source", () => {
    const path = "src/rocket_lantern/assets/rocket-lantern-256.png";
    const request = vi.fn();
    const markup = renderToStaticMarkup(<FileMarkdownImageProvider
      target={{ sourceId: "wsl", projectId: "project", workspaceId: "main", workspacePath: "/repo", path: "README.md" }}
      port={{ request }} onOpenLink={vi.fn()}>
      <FileMarkdownContent content={`# RocketLantern\n\n<p align="center">\n  <img src="${path}" alt="RocketLantern logo" width="128" height="128">\n</p>`} />
    </FileMarkdownImageProvider>);

    expect(markup).toContain('<p align="center">');
    expect(markup).toContain("[align=center]{text-align:center;}");
    expect(markup).toContain(`href="${path}"`);
    expect(markup).toContain("RocketLantern logo");
    expect(markup).not.toContain(`<img src="${path}"`);
    expect(request).not.toHaveBeenCalled(); // Server rendering does not run source-loading effects.
  });

  it("should display HTML images with bounded pixel dimensions and the existing zoom action", () => {
    const markup = render(`<p align="center"><img src="${dataUrl}" alt="Logo" width="128" height="128"></p>`);

    expect(markup).toContain(`src="${dataUrl}"`);
    expect(markup).toContain('width="128" height="128"');
    expect(markup).toContain("width:128px;height:128px;");
    expect(markup).toContain('aria-label="message.openImage"');
  });

  it("should retain useful formatting and generate unique anchors for HTML and Markdown headings", () => {
    const markup = render('<h2 id="constructor" name="location">Setup</h2>\n\n## Setup\n\n<details open><summary>More</summary><p><kbd>Ctrl</kbd> <sup>2</sup></p></details>');

    expect(markup).toContain('<h2 id="file-markdown-setup">Setup</h2>');
    expect(markup).toContain('<h2 id="file-markdown-setup-1">Setup</h2>');
    expect(markup).toContain('<details open=""><summary>More</summary>');
    expect(markup).toContain("<kbd>Ctrl</kbd> <sup>2</sup>");
    expect(markup).not.toContain('id="constructor"');
    expect(markup).not.toContain('name="location"');
  });

  it("should remove active elements and arbitrary attributes while retaining safe content", () => {
    const markup = render([
      '<div id="location" name="constructor" class="hidden" style="position:fixed" onclick="alert(1)">Safe text</div>',
      '<script>alert("script body")</script>',
      '<style>body { display: none }</style>',
      '<iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<object data="https://evil.test"></object><embed src="https://evil.test">',
      '<form action="https://evil.test"><input name="password" type="password"></form>',
      '<svg><foreignObject><p>svg body</p></foreignObject></svg>',
      '<math><mtext>math body</mtext></math>',
      '<template><p>template body</p></template>',
      '<base href="https://evil.test"><meta http-equiv="refresh" content="0;url=https://evil.test">',
      '<img src="https://example.org/logo.png" onerror="alert(1)" srcset="https://evil.test/logo.png 2x">'
    ].join("\n\n"));

    expect(markup).toContain("<div>Safe text</div>");
    expect(markup).toContain('src="https://example.org/logo.png"');
    expect(markup).not.toMatch(/<(?:script|iframe|object|embed|form|svg|math|template|base|meta)\b/);
    expect(markup).not.toMatch(/(?:onclick|onerror|srcdoc|srcSet|srcset|position:fixed|evil\.test|script body|svg body|math body|template body)/);
    expect(markup).not.toContain('id="location"');
    expect(markup).not.toContain('class="hidden"');
    expect(markup).not.toContain('name="constructor"');
  });

  it("should reject executable URL schemes including entity and control-character obfuscation", () => {
    const markup = render([
      '<a href="javascript:alert(1)">JS</a>',
      '<a href="j&#x61;vascript:alert(1)">Entity</a>',
      '<a href="java&#x09;script:alert(1)">Tab</a>',
      '<a href=" javaScript:alert(1)">Space</a>',
      '<a href="vbscript:alert(1)">VB</a>',
      '<a href="data:text/html;base64,PHNjcmlwdD4=">HTML</a>',
      '<img src="javascript:alert(1)" alt="Bad image">',
      '<img src="data:text/html;base64,PHNjcmlwdD4=" alt="HTML image">'
    ].join("\n\n"));

    expect(markup).toContain('<a href="">Entity</a>');
    expect(markup).toContain('<a href="">Tab</a>');
    expect(markup).not.toMatch(/(?:javascript|javaScript|vbscript|data:text\/html|<img\b)/);
  });

  it("should preserve local HTML links and image references without exposing host filesystem URLs", () => {
    const paths = ["./logo.png", "C:/repo/logo.png", "file:///C:/repo/logo.png"];
    const markup = renderToStaticMarkup(<FileMarkdownImageProvider
      target={{ sourceId: "windows", projectId: "project", workspaceId: "main", workspacePath: "C:/repo", path: "README.md" }}
      port={{ request: vi.fn() }} onOpenLink={vi.fn()}>
      <FileMarkdownContent content={paths.map(path => `<a href="${path}">Open</a><img src="${path}" alt="Local">`).join("\n\n")} />
    </FileMarkdownImageProvider>);

    for (const path of paths) expect(markup).toContain(`href="${path}"`);
    expect(markup).not.toContain("<img");
  });

  it.each(["-1", "0", "4097", "100%", "expression(alert(1))"])(
    "should ignore invalid HTML image dimensions (%s)", dimension => {
      const markup = render(`<img src="${dataUrl}" width="${dimension}" height="${dimension}" alt="Logo">`);
      expect(markup).toContain(`src="${dataUrl}"`);
      expect(markup).not.toMatch(/<img\b[^>]*\s(?:width|height)=/);
      expect(markup).toContain("width:auto;height:auto;");
    }
  );

  it("should keep task checkboxes disabled and strip unsupported layout attributes", () => {
    const markup = render('<input type="text" name="password"><p align="justify" style="color:red">Text</p>\n\n- [x] Done');
    expect(markup).toContain('type="checkbox" disabled=""');
    expect(markup).toContain('checked=""');
    expect(markup).toContain("<p>Text</p>");
    expect(markup).not.toContain('type="text"');
    expect(markup).not.toContain('name="password"');
    expect(markup).not.toContain('align="justify"');
  });

  it("should keep HTML literal inside code blocks and leave chat HTML behavior unchanged", () => {
    const markup = render('```html\n<img src="logo.png">\n```');
    const chat = renderToStaticMarkup(<MarkdownMessage markdown={'<p align="center">Logo</p>'} onOpenLink={vi.fn()} />);

    expect(markup).toContain("&lt;");
    expect(markup).toContain("hljs-name");
    expect(markup).not.toContain("<img");
    expect(chat).not.toContain('<p align="center">');
  });
});
