import { Alert, Box } from "@mui/material";
import { runInAction } from "mobx";
import { observer } from "mobx-react-lite";
import { useCallback, useEffect, useRef, useState, type MouseEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import type { FileDocument, FileRequestPort } from "../../stores/files/FileDocument";
import type { ProjectFilesStore } from "../../stores/files/ProjectFilesStore";
import { openMarkdownLink } from "../../stores/files/markdownLinks";
import { FileMarkdownContentM } from "./FileMarkdownContent";
import { FileMarkdownImageProvider } from "./FileMarkdownImageProvider";

/** Previews the live buffer while leaving disk state and the Monaco model untouched. */
export function FileMarkdownPreview({ document, files, port }: {
  document: FileDocument; files: ProjectFilesStore; port: FileRequestPort;
}) {
  const { t } = useTranslation();
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const anchor = document.previewAnchor;
  const handleOpenImageLink = useCallback((href: string): void => {
    setError(null);
    void openMarkdownLink(href, document, files, port)
      .catch(failure => setError(String(failure)));
  }, [document, files, port]);
  useEffect(() => {
    const element = container.current;
    if (element === null) return;
    element.scrollTop = document.previewScrollTop;
    element.focus({ preventScroll: true });
    return () => { runInAction(() => { document.previewScrollTop = element.scrollTop; }); };
  }, [document]);
  useEffect(() => {
    if (anchor === null || container.current === null) return;
    const heading = Array.from(container.current.querySelectorAll<HTMLElement>("[id]"))
      .find(element => element.id === `file-markdown-${anchor}` || element.id === anchor);
    heading?.scrollIntoView({ block: "start" });
    if (anchor === "") container.current.scrollTop = 0;
    runInAction(() => { document.previewAnchor = null; });
  }, [document, anchor]);

  /** Keeps internal links in the document's immutable workspace and exposes failures locally. */
  function handleClick(event: MouseEvent<HTMLDivElement>): void {
    if (event.defaultPrevented) return;
    if (event.button > 1) return;
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest("a");
    const href = link?.getAttribute("href");
    if (href === undefined || href === null || link === null || !event.currentTarget.contains(link)) return;
    event.preventDefault();
    setError(null);
    void openMarkdownLink(href, document, files, port)
      .catch(failure => setError(String(failure)));
  }
  /** Explicit save remains available while the editor is unmounted. */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void document.save();
    }
  }
  const feedback = error === null ? null : (
    <Alert severity="warning" onClose={() => setError(null)}>
      {t("files.previewLinkError")}
      <details><summary>{t("files.details")}</summary>{error}</details>
    </Alert>
  );
  return (
    <Box ref={container} role="region" aria-label={t("files.viewPreview")} tabIndex={0}
      onClick={handleClick} onAuxClick={handleClick} onKeyDown={handleKeyDown}
      sx={{ flex: 1, minHeight: 0, overflow: "auto", p: 3, bgcolor: "background.paper" }}>
      {feedback}
      <FileMarkdownImageProvider target={document.target} port={port} onOpenLink={handleOpenImageLink}>
        <FileMarkdownContentM content={document.content} />
      </FileMarkdownImageProvider>
    </Box>
  );
}
export const FileMarkdownPreviewX = observer(FileMarkdownPreview);
