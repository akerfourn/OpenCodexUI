import { FileAttachmentTileX } from "./FileAttachmentTile";
import { observer } from "mobx-react-lite";
/**
 * Renders image attachment previews for chat messages.
 */
import { Box, Dialog, DialogContent } from "@mui/material";
import { useState } from "react";

import type { OpenCodexAttachment } from "@open-codex-ui/opencodex-protocol";

import { ImageAttachmentPreviewTile } from "./ImageAttachmentPreviewTile";

type ImageAttachmentPreviewGridProps = {
  attachments: OpenCodexAttachment[];
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

  const tiles = attachments.map((attachment) => {
    if (attachment.kind === "file") {
      return <FileAttachmentTileX key={attachment.id} attachment={attachment} />;
    }
    return <ImageAttachmentPreviewTile key={attachment.id} attachment={attachment} onOpen={handleOpenImage} />;
  });

  return (
    <>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
        {tiles}
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

export const ImageAttachmentPreviewGridX = observer(ImageAttachmentPreviewGrid);
