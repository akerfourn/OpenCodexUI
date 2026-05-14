/**
 * Renders composer image attachments with preview and removal controls.
 */
import CloseOutlinedIcon from "@mui/icons-material/CloseOutlined";
import { Box, Dialog, DialogContent, IconButton, Typography } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";

import { readImageAttachmentSrc } from "../messages/imageAttachmentSource";

type ComposerAttachmentListProps = {
  attachments: OpenCodexImageAttachment[];
  /**
   * Handles remove attachment.
   *
   * @param attachmentId Attachment identifier.
   *
   * @returns Nothing.
   */
  onRemoveAttachment(attachmentId: string): void;
};

/**
 * Renders composer attachment previews.
 *
 * @param props Component props.
 *
 * @returns Rendered attachment list.
 */
export function ComposerAttachmentList({
  attachments,
  onRemoveAttachment
}: ComposerAttachmentListProps) {
  const { t } = useTranslation();
  const [previewAttachment, setPreviewAttachment] = useState<OpenCodexImageAttachment | null>(null);

  if (attachments.length === 0) {
    return null;
  }

  return (
    <>
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
          justifySelf: "center",
          mt: 0.5,
          maxWidth: 820,
          width: "100%"
        }}
      >
        {attachments.map((attachment, index) => (
          <Box
            key={attachment.id}
            sx={{
              alignItems: "center",
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 1,
              display: "flex",
              gap: 1,
              maxWidth: 260,
              overflow: "hidden",
              p: 0.75
            }}
          >
            <Box
              component="button"
              type="button"
              onClick={() => setPreviewAttachment(attachment)}
              sx={{
                border: 0,
                bgcolor: "transparent",
                cursor: "pointer",
                display: "block",
                flex: "0 0 auto",
                p: 0
              }}
            >
              <Box
                component="img"
                src={readImageAttachmentSrc(attachment)}
                alt={attachment.name ?? t("composer.attachedImage")}
                sx={{
                  borderRadius: 0.75,
                  display: "block",
                  height: 42,
                  objectFit: "cover",
                  width: 56
                }}
              />
            </Box>
            <Typography variant="caption" noWrap sx={{ flex: "1 1 auto", minWidth: 0 }}>
              {attachment.name ?? t("composer.imageIndex", { index: String(index + 1) })}
            </Typography>
            <IconButton
              type="button"
              size="small"
              aria-label={t("composer.removeAttachment")}
              onClick={() => onRemoveAttachment(attachment.id)}
              sx={{ flex: "0 0 auto" }}
            >
              <CloseOutlinedIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Box>
        ))}
      </Box>
      <Dialog
        open={previewAttachment !== null}
        maxWidth="lg"
        fullWidth
        onClose={() => setPreviewAttachment(null)}
      >
        {previewAttachment !== null ? (
          <DialogContent sx={{ p: 1, bgcolor: "#0b1017" }}>
            <Box
              component="img"
              src={readImageAttachmentSrc(previewAttachment)}
              alt={previewAttachment.name ?? t("composer.attachedImage")}
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
