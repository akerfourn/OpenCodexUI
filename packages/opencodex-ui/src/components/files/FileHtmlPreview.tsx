import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, LinearProgress } from "@mui/material";
import { useTranslation } from "react-i18next";
import type { OpenCodexHtmlPreviewSession } from "@open-codex-ui/opencodex-protocol";
import type { FileDocument, FileRequestPort } from "../../stores/files/FileDocument";

/** Runs source-owned pages in an opaque sandbox, with relative assets served through workspace permissions. */
export function FileHtmlPreview({ document, port }: { document: FileDocument; port: FileRequestPort }) {
  const { t } = useTranslation();
  const [session, setSession] = useState<OpenCodexHtmlPreviewSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const target = document.target;
  const content = document.content;
  const version = document.version;
  useEffect(() => {
    let cancelled = false;
    let opened: OpenCodexHtmlPreviewSession | null = null;
    setSession(null);
    setError(null);
    /** Revokes late or hidden sessions without retaining their source bytes. */
    async function close(value: OpenCodexHtmlPreviewSession): Promise<void> {
      await port.request({ type: "filePreview.close", id: value.id });
    }
    /** Refreshes the captured buffer after an edit, without writing it to disk. */
    async function open(): Promise<void> {
      if (target === null || cancelled) return;
      try {
        const result = await port.request<OpenCodexHtmlPreviewSession>({
          type: "filePreview.open", target: { ...target }, content
        });
        opened = result;
        if (cancelled) await close(result);
        else setSession(result);
      } catch (failure) {
        if (!cancelled) setError(String(failure));
      }
    }
    const timer = window.setTimeout(() => { void open(); }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      if (opened !== null) void close(opened).catch(() => undefined);
    };
  }, [target, content, version, port]);

  if (error !== null) return <Alert severity="error">{t("files.htmlPreviewError")} {error}</Alert>;
  if (session === null) return <LinearProgress />;
  return <iframe key={session.id} title={t("files.htmlPreviewTitle", { name: document.name })} src={session.url}
    sandbox="allow-scripts" referrerPolicy="no-referrer"
    style={{ flex: 1, width: "100%", minHeight: 0, border: 0, background: "white", colorScheme: "normal" }} />;
}

export const FileHtmlPreviewX = observer(FileHtmlPreview);
