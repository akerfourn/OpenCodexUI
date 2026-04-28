import { observer } from "mobx-react-lite";
import { Box, ListItemButton, ListItemIcon, Typography } from "@mui/material";
import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";

import type { OpenCodexThread } from "@open-codex-ui/opencodex-protocol";

import type { RootStore } from "../stores/RootStore";

type ThreadButtonProps = {
  store: RootStore;
  thread: OpenCodexThread;
};

export function ThreadButton({ store, thread }: ThreadButtonProps) {
  function handleOpenThread(): void {
    store.openThread(thread.id);
  }

  const isActive = store.currentThread?.id === thread.id;

  return (
    <ListItemButton
      selected={isActive}
      onClick={handleOpenThread}
      sx={{ mb: 0.5, alignItems: "flex-start", borderRadius: 1 }}
    >
      <ListItemIcon sx={{ minWidth: 28, color: "inherit", mt: "2px" }}>
        <ChatBubbleOutlineOutlinedIcon fontSize="small" />
      </ListItemIcon>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography variant="body2" noWrap>
          {getThreadTitle(thread)}
        </Typography>
        {thread.branchName !== null ? (
          <Typography variant="caption" component="div" noWrap>
            {thread.branchName}
          </Typography>
        ) : null}
      </Box>
    </ListItemButton>
  );
}

export const ThreadButtonX = observer(ThreadButton);

function getThreadTitle(thread: OpenCodexThread): string {
  if (thread.title.trim().length > 0) {
    return thread.title;
  }

  if (thread.preview.trim().length > 0) {
    return thread.preview;
  }

  return "Conversation sans titre";
}
