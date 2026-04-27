import { observer } from "mobx-react-lite";

import type { RootStore } from "../stores/RootStore";
import { ChatActivityPanel } from "./ChatActivityPanel";
import { ChatComposer } from "./ChatComposer";
import { ChatHeader } from "./ChatHeader";
import { ChatMessageList } from "./ChatMessageList";
import { ChatEmptyState } from "./ChatEmptyState";

type ChatViewProps = {
  store: RootStore;
};

export const ChatView = observer(function ChatView({ store }: ChatViewProps) {
  const currentThread = store.currentThread;

  if (currentThread === null) {
    return (
      <div className="chat-view">
        <ChatEmptyState store={store} />
      </div>
    );
  }

  return (
    <div className="chat-view">
      <ChatHeader store={store} />
      <ChatMessageList store={store} />
      <ChatActivityPanel store={store} />
      <ChatComposer
        store={store}
        currentThreadId={currentThread.id}
        selectedModel={store.selectedModel}
        reasoningEffort={store.reasoningEffort}
        modelOptions={store.modelOptions}
        isWorking={store.isWorking}
      />
    </div>
  );
});
