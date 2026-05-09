/**
 * Renders image attachment previews for chat messages.
 */
import { Box } from "@mui/material";

import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";

type ImageAttachmentPreviewGridProps = {
  attachments: OpenCodexImageAttachment[];
};

/**
 * Renders a compact grid of image previews.
 *
 * @param props Component props.
 *
 * @returns Rendered image preview grid.
 */
export function ImageAttachmentPreviewGrid({ attachments }: ImageAttachmentPreviewGridProps) {
  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
      {attachments.map((attachment) => (
        <Box
          component="img"
          key={attachment.id}
          src={readImageAttachmentSrc(attachment)}
          alt={attachment.name ?? "Attached image"}
          sx={{
            width: 132,
            height: 96,
            objectFit: "cover",
            borderRadius: 1,
            border: "1px solid",
            borderColor: "divider"
          }}
        />
      ))}
    </Box>
  );
}

export function readImageAttachmentSrc(attachment: OpenCodexImageAttachment): string {
  if (attachment.previewUrl !== null && attachment.previewUrl !== undefined) {
    return attachment.previewUrl;
  }

  if (attachment.source === "dataUrl") {
    return attachment.value;
  }

  return `file://${encodeURI(attachment.value)}`;
}
