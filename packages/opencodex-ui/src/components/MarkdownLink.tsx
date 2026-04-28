import { Link } from "@mui/material";
import type { MouseEvent, ReactNode } from "react";

type MarkdownLinkProps = {
  href?: string;
  children?: ReactNode;
  onOpenLink(href: string): void;
};

export function MarkdownLink({ href, children, onOpenLink }: MarkdownLinkProps) {
  if (href === undefined || href.length === 0) {
    return <>{children}</>;
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>): void {
    event.preventDefault();
    if (href === undefined || href.length === 0) {
      return;
    }

    onOpenLink(href);
  }

  return (
    <Link
      href={href}
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
