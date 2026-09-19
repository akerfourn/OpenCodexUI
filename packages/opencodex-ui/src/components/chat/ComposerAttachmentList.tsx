/**
 * Renders composer image attachments with preview and removal controls.
 */
import { observer } from "mobx-react-lite";
import { ComposerAttachmentTileX } from "./ComposerAttachmentTile";
import { Box, Dialog, DialogContent } from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { OpenCodexAttachment, OpenCodexImageAttachment } from "@open-codex-ui/opencodex-protocol";

import { readImageAttachmentSrc } from "../messages/imageAttachmentSource";

type ComposerAttachmentListProps = {
  attachments: OpenCodexAttachment[];
  disabled?: boolean;
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
  disabled = false,
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
        {attachments.map((attachment) => (
          <ComposerAttachmentTileX key={attachment.id} attachment={attachment}
            disabled={disabled} onPreview={setPreviewAttachment} onRemove={onRemoveAttachment} />
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

export const ComposerAttachmentListX = observer(ComposerAttachmentList);
