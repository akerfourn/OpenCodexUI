import { observer } from "mobx-react-lite";
import { Stack } from "@mui/material";

import type { RootStore } from "../stores/RootStore";
import { ChatActivityPanelX } from "./ChatActivityPanel";
import { ChatComposer } from "./ChatComposer";
import { ChatHeaderX } from "./ChatHeader";
import { ChatMessageListX } from "./ChatMessageList";
import { ChatEmptyState } from "./ChatEmptyState";

type ChatViewProps = {
  store: RootStore;
};

export function ChatView({ store }: ChatViewProps) {
  const currentThread = store.currentThread;

  if (currentThread === null) {
    return (
      <Stack className="chat-view">
        <ChatEmptyState store={store} />
      </Stack>
    );
  }

  return (
    <Stack className="chat-view">
      <ChatHeaderX store={store} />
      <ChatMessageListX store={store} />
      <ChatActivityPanelX store={store} />
      <ChatComposer
        store={store}
        currentThreadId={currentThread.id}
        selectedModel={store.selectedModel}
        reasoningEffort={store.reasoningEffort}
        modelOptions={store.modelOptions}
        isWorking={store.isWorking}
      />
    </Stack>
  );
}

export const ChatViewX = observer(ChatView);
