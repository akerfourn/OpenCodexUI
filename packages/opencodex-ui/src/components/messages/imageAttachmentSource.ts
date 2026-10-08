/**
 * Resolves image attachment sources for renderer previews.
 */
import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";

/**
 * Resolves an attachment to a browser-displayable image source.
 *
 * @param attachment Image attachment.
 * @returns Preview URL or source-owned path resolved by the conversation's image loader.
 */
export function readImageAttachmentSrc(attachment: OpenCodexImageAttachment): string {
  if (attachment.previewUrl !== null && attachment.previewUrl !== undefined) {
    return attachment.previewUrl;
  }

  if (attachment.source === "dataUrl") {
    return attachment.value;
  }

  return attachment.value;
}
