import { Alert, Box, Button, Paper, Stack, Typography, useTheme } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { CopyIconButton } from "../common/CopyIconButton";
import { MarkdownCodeBlock } from "./MarkdownCodeBlock";
import { MAX_MERMAID_SOURCE_LENGTH, renderMermaidImage } from "./mermaidRenderer";

/** Displays inert diagram images, with literal source fallback for incomplete or invalid input. */
export function MermaidDiagram({ code }: { code: string }) {
  const { t } = useTranslation();
  const { palette } = useTheme();
  const container = useRef<HTMLElement>(null);
  const [showSource, setShowSource] = useState(false);
  const [result, setResult] = useState<{ code: string; mode: string; image?: string; error?: string } | null>(null);
  const mode = palette.mode;
  let current = result;
  if (result?.code !== code || result.mode !== mode) current = null;
  const tooLarge = code.length > MAX_MERMAID_SOURCE_LENGTH;
  const literalVisible = showSource || tooLarge || code.trim().length === 0 || current?.error !== undefined;

  useEffect(() => {
    if (showSource || tooLarge || code.trim().length === 0) return;
    const controller = new AbortController();
    /** Starts expensive layout only once this block approaches the visible viewport. */
    function render(): void {
      void renderMermaidImage(code, mode, controller.signal).then(image => {
        if (!controller.signal.aborted) setResult({ code, mode, image });
      }).catch(error => {
        if (!controller.signal.aborted) setResult({ code, mode, error: String(error) });
      });
    }
    let observer: IntersectionObserver | undefined;
    if (typeof IntersectionObserver === "undefined" || container.current === null) render();
    else {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) { observer?.disconnect(); render(); }
      }, { rootMargin: "200px" });
      observer.observe(container.current);
    }
    return () => { observer?.disconnect(); controller.abort(); };
  }, [code, mode, showSource, tooLarge]);

  /** Switching to source never changes the saved Markdown or starts another layout. */
  function handleToggleSource(): void { setShowSource(value => !value); }
  let toggleLabel = t("message.mermaid.showSource");
  if (showSource) toggleLabel = t("message.mermaid.showDiagram");
  let content = <Typography role="status" variant="body2" sx={{ p: 2 }}>{t("message.mermaid.loading")}</Typography>;
  if (current?.image !== undefined) {
    content = <Box sx={{ p: 2, overflow: "auto", textAlign: "center" }}>
      <Box component="img" src={current.image} alt={t("message.mermaid.diagram")} draggable={false}
        sx={{ display: "inline-block", maxWidth: "100%", height: "auto", verticalAlign: "middle" }} />
    </Box>;
  }
  if (literalVisible) {
    content = <MarkdownCodeBlock code={code} language="mermaid" className="language-mermaid" />;
  }
  let warning = null;
  if (tooLarge) warning = <Alert severity="info">{t("message.mermaid.tooLarge")}</Alert>;
  else if (current?.error !== undefined) {
    warning = <Alert severity="warning">{t("message.mermaid.invalid")}
      <details><summary>{t("message.mermaid.details")}</summary>{current.error}</details>
    </Alert>;
  }
  const copyAction = literalVisible ? null
    : <CopyIconButton value={code} label={t("chat.copyCodeBlock")} copiedLabel={t("message.copied")} />;
  const toggleAction = tooLarge || code.trim().length === 0 || current?.error !== undefined ? null
    : <Button size="small" aria-pressed={showSource} onClick={handleToggleSource}>{toggleLabel}</Button>;
  return <Paper ref={container} component="section" variant="outlined" aria-label={t("message.mermaid.diagram")}
    sx={{ my: 1, minWidth: 0, maxWidth: "100%", overflow: "hidden", bgcolor: "background.paper" }}>
    <Stack direction="row" spacing={1} sx={{ px: 1, py: 0.5, alignItems: "center" }}>
      <Typography variant="caption" sx={{ flex: 1 }}>Mermaid</Typography>
      {toggleAction}{copyAction}
    </Stack>
    {warning}{content}
  </Paper>;
}
