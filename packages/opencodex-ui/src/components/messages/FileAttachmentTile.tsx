import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import { Box, Chip, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { OpenCodexFileAttachment } from "@open-codex-ui/opencodex-protocol";

/** Shows a file's extension and name without trying to preview its contents. */
export function FileAttachmentTile({ attachment }: { attachment: OpenCodexFileAttachment }) {
  const extension = attachment.name.split(".").pop() ?? "";
  const label = /^[a-z0-9]{1,8}$/i.test(extension) && attachment.name.includes(".")
    ? extension.toUpperCase() : "FILE";
  return (
    <Box title={attachment.name} sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0, maxWidth: 260, p: 1 }}>
      <InsertDriveFileOutlinedIcon color="action" />
      <Chip size="small" label={label} />
      <Typography variant="caption" noWrap>{attachment.name}</Typography>
    </Box>
  );
}

export const FileAttachmentTileX = observer(FileAttachmentTile);
