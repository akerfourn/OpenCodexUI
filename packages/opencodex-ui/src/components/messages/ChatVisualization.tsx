import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Box, Typography, useTheme } from "@mui/material";
import { useTranslation } from "react-i18next";

import { ChatVisualizationContext } from "./ChatVisualizationContext";
import { MarkdownLink } from "./MarkdownLink";
import { MarkdownLinkContext } from "./MarkdownLinkContext";
import { createVisualizationDocument } from "./visualizationDocument";

interface ChatVisualizationProps {
  "data-visualization-path"?: string;
  "data-visualization-title"?: string;
  "data-visualization-mode"?: "wide";
}

interface VisualizationSnapshot {
  reader: (path: string) => Promise<string | null>;
  path: string;
  html: string | null;
}

/** Displays an assistant's source-owned HTML reference without exposing the app to its scripts. */
export function ChatVisualization(props: ChatVisualizationProps) {
  const path = props["data-visualization-path"] ?? "";
  const suppliedTitle = props["data-visualization-title"];
  const isWide = props["data-visualization-mode"] === "wide";
  const reader = useContext(ChatVisualizationContext);
  const linkContext = useContext(MarkdownLinkContext);
  const { t } = useTranslation();
  const themeMode = useTheme().palette.mode;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const [snapshot, setSnapshot] = useState<VisualizationSnapshot | null>(null);
  const [height, setHeight] = useState(160);
  const current = snapshot?.reader === reader && snapshot.path === path ? snapshot : null;
  const html = current?.html ?? null;
  const document = useMemo(
    () => html === null ? null : createVisualizationDocument(html, themeMode),
    [html, themeMode]
  );

  useEffect(() => {
    if (hasBeenVisible || containerRef.current === null || reader === null) return;
    if (typeof IntersectionObserver === "undefined") {
      setHasBeenVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setHasBeenVisible(true);
    }, { rootMargin: "200px" });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [hasBeenVisible, reader]);

  useEffect(() => {
    if (!hasBeenVisible || reader === null || path.length === 0) return;
    let active = true;

    /** Stores only results that still belong to this frame's source and path. */
    function receive(html: string | null): void {
      if (active && reader !== null) setSnapshot({ reader, path, html });
    }

    void reader(path).then(receive, () => receive(null));
    return () => { active = false; };
  }, [hasBeenVisible, reader, path]);

  useEffect(() => {
    if (document === null) return;

    /** Accepts a bounded height from this opaque frame only. */
    function handleResize(event: MessageEvent<unknown>): void {
      const frameWindow = frameRef.current?.contentWindow;
      if (frameWindow == null || event.origin !== "null" || event.source !== frameWindow) return;
      const data = event.data;
      if (data === null || typeof data !== "object" || !("type" in data)
        || data.type !== "opencodex.visualizationHeight" || !("height" in data)
        || typeof data.height !== "number" || !Number.isFinite(data.height)) return;
      setHeight(Math.max(48, Math.min(800, Math.ceil(data.height))));
    }

    window.addEventListener("message", handleResize);
    return () => window.removeEventListener("message", handleResize);
  }, [document]);

  if (reader === null && linkContext !== null && path.length > 0) {
    return (
      <p>
        <MarkdownLink href={path} {...linkContext}>
          {suppliedTitle || path}
        </MarkdownLink>
      </p>
    );
  }

  const title = suppliedTitle || t("message.visualization.title");
  let content = <Typography variant="caption" role="status">{t("message.visualization.loading")}</Typography>;
  if (document !== null) {
    content = (
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={document}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        style={{ display: "block", width: "100%", height, border: 0 }}
      />
    );
  } else if (current !== null || reader === null || path.length === 0) {
    content = <Typography variant="caption" title={path}>{t("message.visualization.unavailable")}</Typography>;
  }

  return (
    <Box ref={containerRef} sx={{ my: 1, minHeight: 48, maxWidth: isWide ? 1024 : 736 }}>
      {content}
    </Box>
  );
}
