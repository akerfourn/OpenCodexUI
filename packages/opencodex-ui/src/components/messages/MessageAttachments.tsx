import { observer } from "mobx-react-lite";

import type { OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";

import { ImageAttachmentPreviewGrid } from "./ImageAttachmentPreviewGrid";

type MessageAttachmentsProps = {
  item: OpenCodexTurnItem;
};

/** Reads attachments at the leaf so attachment updates do not rerender the message row. */
export function MessageAttachments({ item }: MessageAttachmentsProps) {
  const attachments = item.attachments;

  if (attachments === undefined || attachments.length === 0) {
    return null;
  }

  return <ImageAttachmentPreviewGrid attachments={attachments} />;
}

export const MessageAttachmentsX = observer(MessageAttachments);
