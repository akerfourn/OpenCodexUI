import { observer } from "mobx-react-lite";
import { Stack } from "@mui/material";

import type { RootStore } from "../stores/RootStore";
import { ChatActivityPanelX } from "./ChatActivityPanel";
import { ChatComposer } from "./ChatComposer";
import { ChatHeaderX } from "./ChatHeader";
import { ChatMessageListX } from "./ChatMessageList";
import { ChatEmptyState } from "./ChatEmptyState";
import { ChatLoadingState } from "./ChatLoadingState";

type ChatViewProps = {
  store: RootStore;
};

export function ChatView({ store }: ChatViewProps) {
  const currentThread = store.currentThread;

  if (store.isCreatingThread) {
    return (
      <Stack className="chat-view">
        <ChatLoadingState label="Création du chat..." fillView />
      </Stack>
    );
  }

  if (currentThread === null) {
    return (
      <Stack className="chat-view">
        <ChatEmptyState store={store} />
      </Stack>
    );
  }

  const isLoadingCurrentThread = store.loadingThreadId === currentThread.id && store.turns.length === 0;
  const messageContent = isLoadingCurrentThread ? (
    <ChatLoadingState label="Chargement du chat..." />
  ) : (
    <ChatMessageListX store={store} />
  );

  return (
    <Stack className="chat-view">
      <ChatHeaderX store={store} />
      {messageContent}
      <ChatActivityPanelX store={store} />
      <ChatComposer
        store={store}
        currentThreadId={currentThread.id}
        selectedModel={store.selectedModel}
        reasoningEffort={store.reasoningEffort}
        modelOptions={store.modelOptions}
        isWorking={store.isWorking || store.isStartingTurn || store.loadingThreadId !== null}
      />
    </Stack>
  );
}

export const ChatViewX = observer(ChatView);
