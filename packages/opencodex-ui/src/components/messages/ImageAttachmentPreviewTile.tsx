import { observer } from "mobx-react-lite";
import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";
import { ChatImage } from "./ChatImage";
import { readImageAttachmentSrc } from "./imageAttachmentSource";

interface ImageAttachmentPreviewTileProps {
  attachment: OpenCodexImageAttachment;
}

/** Resolves historical attachment paths on their source and opens decoded bytes in the grid viewer. */
export function ImageAttachmentPreviewTile({ attachment }: ImageAttachmentPreviewTileProps) {
  let localPath: string | undefined;
  if (attachment.source === "localPath") localPath = attachment.value;
  return <ChatImage src={readImageAttachmentSrc(attachment)} localPath={localPath}
    alt={attachment.name ?? undefined} compact />;
}

export const ImageAttachmentPreviewTileX = observer(ImageAttachmentPreviewTile);
