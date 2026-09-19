import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { Box, IconButton, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";
import type { OpenCodexAttachment, OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";
import { FileAttachmentTileX } from "../messages/FileAttachmentTile";
import { readImageAttachmentSrc } from "../messages/imageAttachmentSource";

/** Renders one removable file or image in the composer. */
export function ComposerAttachmentTile({ attachment, onPreview, onRemove, disabled = false }: {
  attachment: OpenCodexAttachment;
  disabled?: boolean;
  onPreview(attachment: OpenCodexImageAttachment): void;
  onRemove(id: string): void;
}) {
  const { t } = useTranslation();
  let preview;
  if (attachment.kind === "image") {
    preview = (
      <>
        <Box component="button" type="button" onClick={() => onPreview(attachment)}
          sx={{ border: 0, bgcolor: "transparent", cursor: "pointer", p: 0 }}>
          <Box component="img" src={readImageAttachmentSrc(attachment)}
            alt={attachment.name ?? t("composer.attachedImage")}
            sx={{ height: 42, width: 56, objectFit: "cover", borderRadius: 0.75, display: "block" }} />
        </Box>
        <Typography variant="caption" noWrap>{attachment.name ?? t("composer.attachedImage")}</Typography>
      </>
    );
  } else {
    preview = <FileAttachmentTileX attachment={attachment} />;
  }
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, border: 1, borderColor: "divider", borderRadius: 1, p: 0.75, maxWidth: 300 }}>
      {preview}
      <IconButton disabled={disabled} size="small" aria-label={t("composer.removeAttachment")} onClick={() => onRemove(attachment.id)}>
        <CloseOutlinedIcon sx={{ fontSize: 15 }} />
      </IconButton>
    </Box>
  );
}

export const ComposerAttachmentTileX = observer(ComposerAttachmentTile);
