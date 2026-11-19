import { useContext } from "react";
import { observer } from "mobx-react-lite";
import { Box } from "@mui/material";
import type { OpenCodexAttachment } from "@open-codex-ui/opencodex-protocol";
import { FileAttachmentTileX } from "./FileAttachmentTile";
import { ImageAttachmentPreviewTileX } from "./ImageAttachmentPreviewTile";
import { MessageImageGallery } from "./MessageImageGallery";
import { MessageImageGalleryContext } from "./MessageImageGalleryContext";

/** Joins the message gallery, creating an isolated gallery when displayed on its own. */
export function ImageAttachmentPreviewGrid({ attachments }: { attachments: OpenCodexAttachment[] }) {
  const gallery = useContext(MessageImageGalleryContext);
  const tiles = attachments.map(attachment => {
    if (attachment.kind === "file") return <FileAttachmentTileX key={attachment.id} attachment={attachment} />;
    return <ImageAttachmentPreviewTileX key={attachment.id} attachment={attachment} />;
  });
  const grid = <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>{tiles}</Box>;
  if (gallery === null) return <MessageImageGallery>{grid}</MessageImageGallery>;
  return grid;
}

export const ImageAttachmentPreviewGridX = observer(ImageAttachmentPreviewGrid);
