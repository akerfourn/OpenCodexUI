import { Box } from "@mui/material";
import { observer } from "mobx-react-lite";
import type { FileDocument } from "../../stores/files/FileDocument";

/** A viewer failure still leaves the user's full buffer available to copy or save. */
export function FileViewerFallback({ document }: { document: FileDocument }) {
  return (
    <>
      null
      <Box
        component="textarea"
        readOnly
        aria-label={document.name}
        value={document.content}
        sx={{ flex: 1, minHeight: 100, color: "text.primary", bgcolor: "background.default" }}
      />
    </>
  );
}
export const FileViewerFallbackX = observer(FileViewerFallback);
