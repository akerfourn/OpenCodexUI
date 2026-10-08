import { observer } from "mobx-react-lite";
import { Box } from "@mui/material";
import type { OpenCodexImageAttachment, OpenCodexTurnItem } from "@open-codex-ui/opencodex-protocol";
import { ChatImage } from "./ChatImage";
import { readImageAttachmentSrc } from "./imageAttachmentSource";

/** Collects image outputs once even when raw and structured notifications describe the same result. */
function collectImages(items: OpenCodexTurnItem[]): OpenCodexImageAttachment[] {
  const images: OpenCodexImageAttachment[] = [];
  const values = new Set<string>();
  for (const item of items) {
    if (item.role !== "activity") continue;
    for (const attachment of item.attachments ?? []) {
      if (attachment.kind !== "image" || values.has(attachment.value)) continue;
      values.add(attachment.value);
      images.push(attachment);
    }
  }
  return images;
}

/** Keeps generated and tool-result images visible after the reasoning history collapses. */
export function ActivityImageResults({ items }: { items: OpenCodexTurnItem[] }) {
  const images = collectImages(items);
  if (images.length === 0) return null;
  const previews = images.map((image) => {
    let localPath: string | undefined;
    if (image.source === "localPath") localPath = image.value;
    return <ChatImage key={image.id} src={readImageAttachmentSrc(image)} localPath={localPath}
      alt={image.name ?? undefined} />;
  });
  return <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>{previews}</Box>;
}

export const ActivityImageResultsX = observer(ActivityImageResults);
