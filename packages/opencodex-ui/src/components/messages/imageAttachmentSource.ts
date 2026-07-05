/**
 * Resolves image attachment sources for renderer previews.
 */
import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";

/**
 * Resolves an attachment to a browser-displayable image source.
 *
 * @param attachment Image attachment.
 * @returns Data URL, preview URL, or file URL.
 */
export function readImageAttachmentSrc(attachment: OpenCodexImageAttachment): string {
  if (attachment.previewUrl !== null && attachment.previewUrl !== undefined) {
    return attachment.previewUrl;
  }

  if (attachment.source === "dataUrl") {
    return attachment.value;
  }

  return `file://${encodeURI(attachment.value)}`;
}
