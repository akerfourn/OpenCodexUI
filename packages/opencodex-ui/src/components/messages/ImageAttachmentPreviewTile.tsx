/**
 * Renders one historical image attachment preview.
 */
import BrokenImageOutlinedIcon from "@mui/icons-material/BrokenImageOutlined";
import { Box, Tooltip } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";

import { readImageAttachmentSrc } from "./imageAttachmentSource";

type ImageAttachmentPreviewTileProps = {
  attachment: OpenCodexImageAttachment;
  onOpen(src: string, alt: string): void;
};

/**
 * Renders one image tile and falls back when the source cannot be loaded.
 *
 * @param props Component props.
 *
 * @returns Rendered image tile.
 */
export function ImageAttachmentPreviewTile({
  attachment,
  onOpen
}: ImageAttachmentPreviewTileProps) {
  const { t } = useTranslation();
  const [isUnavailable, setIsUnavailable] = useState(false);
  const src = readImageAttachmentSrc(attachment);
  const alt = attachment.name ?? t("message.attachedImage");

  if (isUnavailable) {
    return (
      <Tooltip title={t("message.imageUnavailable")}>
        <Box
          role="img"
          aria-label={t("message.imageUnavailable")}
          sx={{
            alignItems: "center",
            bgcolor: "grey.100",
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 1,
            color: "text.secondary",
            display: "flex",
            height: 96,
            justifyContent: "center",
            width: 132
          }}
        >
          <BrokenImageOutlinedIcon fontSize="small" />
        </Box>
      </Tooltip>
    );
  }

  return (
    <Box
      component="button"
      type="button"
      aria-label={t("message.openImage")}
      onClick={() => onOpen(src, alt)}
      sx={{
        bgcolor: "transparent",
        border: 0,
        cursor: "zoom-in",
        display: "block",
        p: 0
      }}
    >
      <Box
        component="img"
        src={src}
        alt={alt}
        onError={() => setIsUnavailable(true)}
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          display: "block",
          height: 96,
          objectFit: "cover",
          width: 132
        }}
      />
    </Box>
  );
}
