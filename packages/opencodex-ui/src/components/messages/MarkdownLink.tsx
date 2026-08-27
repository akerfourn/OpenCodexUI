/**
 * Renders the markdown link component for the OpenCodex UI.
 */
import { Link } from "@mui/material";
import type { MouseEvent, ReactNode } from "react";

type MarkdownLinkProps = {
  href?: string;
  children?: ReactNode;
  /** Requires a modifier key before opening the link. */
  requireModifiedClick?: boolean;
  /** Handles opening the link externally. */
  onOpenLink(href: string): void;
};

/**
 * Renders the markdown link component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function MarkdownLink({
  href,
  children,
  requireModifiedClick = false,
  onOpenLink
}: MarkdownLinkProps) {
  if (href === undefined || href.length === 0) {
    return <>{children}</>;
  }
  const linkHref = href;

  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    if (!shouldOpenMarkdownLink(event, requireModifiedClick)) {
      return;
    }

    onOpenLink(linkHref);
  }

  return (
    <Link
      href={linkHref}
      underline="hover"
      onClick={handleClick}
      sx={{
        wordBreak: "break-word"
      }}
    >
      {children}
    </Link>
  );
}

/**
 * Checks whether a Markdown link click has the required modifier key.
 *
 * Supporting both control and meta keeps the interaction consistent across
 * Linux, Windows and macOS.
 *
 * @param event Mouse event metadata.
 * @param requireModifiedClick Whether a modifier is required.
 * @returns Whether the link should be opened.
 */
export function shouldOpenMarkdownLink(
  event: Pick<MouseEvent<HTMLAnchorElement>, "ctrlKey" | "metaKey">,
  requireModifiedClick: boolean
): boolean {
  return !requireModifiedClick || event.ctrlKey || event.metaKey;
}
