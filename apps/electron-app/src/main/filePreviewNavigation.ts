import type { WebContents } from "electron";

/** Prevents sandboxed previews from navigating themselves to arbitrary origins or privileged app pages. */
export function configureFilePreviewNavigation(
  contents: Pick<WebContents, "on">, isActiveUrl: (url: string) => boolean
): void {
  contents.on("will-frame-navigate", details => {
    if (!details.isMainFrame && !isActiveUrl(details.url)) details.preventDefault();
  });
  contents.on("will-redirect", details => {
    if (!details.isMainFrame && !isActiveUrl(details.url)) details.preventDefault();
  });
}
