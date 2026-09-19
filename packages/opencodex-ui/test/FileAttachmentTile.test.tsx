import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ComposerAttachmentListX } from "../src/components/chat/ComposerAttachmentList";
import { ImageAttachmentPreviewGridX } from "../src/components/messages/ImageAttachmentPreviewGrid";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe("generic attachment rendering", () => {
  it.each(["notes.txt", "report.pdf", "letter.docx", "README.md", "archive.zip"])("should show %s without an image thumbnail", (name) => {
    const attachments = [{ id: "file", kind: "file" as const, source: "dataUrl" as const, name, value: "data:application/octet-stream;base64,AA==" }];
    const draft = renderToStaticMarkup(<ComposerAttachmentListX attachments={attachments} onRemoveAttachment={() => undefined} />);
    const history = renderToStaticMarkup(<ImageAttachmentPreviewGridX attachments={attachments} />);
    for (const markup of [draft, history]) {
      expect(markup).toContain(name);
      expect(markup).toContain(name.split(".").pop()!.toUpperCase());
      expect(markup).not.toContain("<img");
      expect(markup).not.toContain("base64");
    }
    expect(draft).toContain("composer.removeAttachment");
  });
});
