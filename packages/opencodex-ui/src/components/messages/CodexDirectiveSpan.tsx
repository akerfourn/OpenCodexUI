import { useContext, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { Button } from "@mui/material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { useTranslation } from "react-i18next";
import type { Element } from "hast";
import { CodexFollowupContext } from "./CodexFollowupContext";
import { MarkdownLinkContext } from "./MarkdownLinkContext";
import { MarkdownLink } from "./MarkdownLink";

/** Renders known presentation hints through existing file routing and draft actions. */
export function CodexDirectiveSpan({ node, children, ...props }: {
  node?: Element;
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useTranslation();
  const links = useContext(MarkdownLinkContext);
  const composer = useContext(CodexFollowupContext);
  const kind = node?.properties["data-codex-kind"];
  const value = node?.properties["data-codex-value"];
  if (typeof value !== "string") return <span {...props}>{children}</span>;
  if (kind === "file-citation" && links !== null) {
    return <MarkdownLink href={value} requireModifiedClick={links.requireModifiedClick}
      onOpenLink={links.onOpenLink}>{children}</MarkdownLink>;
  }
  if (kind !== "followup") return <span>{children}</span>;

  /** Adds a suggestion only after an explicit click, retaining the current draft. */
  function select(): void {
    if (typeof value === "string") composer?.suggestPrompt(value);
  }

  if (composer === null) return <span>{children}</span>;
  return <Button size="small" variant="outlined" disabled={composer.isSubmitting}
    startIcon={<AutoAwesomeOutlinedIcon />}
    aria-description={`${t("message.useSuggestedPrompt")} — ${value}`}
    onClick={select} sx={{ my: 0.25, textTransform: "none", textAlign: "left" }}>{children}</Button>;
}
export const CodexDirectiveSpanX = observer(CodexDirectiveSpan);
