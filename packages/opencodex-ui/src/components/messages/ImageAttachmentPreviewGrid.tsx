/**
 * Renders image attachment previews for chat messages.
 */
import { Box, Dialog, DialogContent } from "@mui/material";
import { useState } from "react";

import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";

import { ImageAttachmentPreviewTile } from "./ImageAttachmentPreviewTile";

type ImageAttachmentPreviewGridProps = {
  attachments: OpenCodexImageAttachment[];
};

type OpenedImage = {
  src: string;
  alt: string;
};

/**
 * Renders a compact grid of image previews.
 *
 * @param props Component props.
 *
 * @returns Rendered image preview grid.
 */
export function ImageAttachmentPreviewGrid({ attachments }: ImageAttachmentPreviewGridProps) {
  const [openedImage, setOpenedImage] = useState<OpenedImage | null>(null);

  function handleOpenImage(src: string, alt: string): void {
    setOpenedImage({ src, alt });
  }

  function handleCloseImage(): void {
    setOpenedImage(null);
  }

  return (
    <>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
        {attachments.map((attachment) => (
          <ImageAttachmentPreviewTile
            key={attachment.id}
            attachment={attachment}
            onOpen={handleOpenImage}
          />
        ))}
      </Box>
      <Dialog open={openedImage !== null} maxWidth="lg" fullWidth onClose={handleCloseImage}>
        {openedImage !== null ? (
          <DialogContent sx={{ p: 1, bgcolor: "#0b1017" }}>
            <Box
              component="img"
              src={openedImage.src}
              alt={openedImage.alt}
              sx={{
                display: "block",
                maxHeight: "80vh",
                maxWidth: "100%",
                mx: "auto",
                objectFit: "contain"
              }}
            />
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
