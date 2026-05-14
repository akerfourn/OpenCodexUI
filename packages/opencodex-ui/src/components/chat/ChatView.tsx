/**
 * Renders the chat view component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { Alert, Button, Stack } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import { ChatComposer } from "./ChatComposer";
import { ChatHeaderX } from "./ChatHeader";
import { ChatMessageListX } from "../messages/ChatMessageList";
import { ChatEmptyState } from "./ChatEmptyState";
import { ChatLoadingState } from "./ChatLoadingState";

type ChatViewProps = {
  store: RootStore;
  projectStore: ProjectStore;
};

/**
 * Renders the chat view component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ChatView({ store, projectStore }: ChatViewProps) {
  const { t } = useTranslation();
  const appStore = store.appStore;
  const chatStore = projectStore.selectedChat;
  const isOrphanProject = projectStore.isOrphan;

  function handleOpenSources(): void {
    store.openSourcesHome();
  }

  if (projectStore.isCreatingThread) {
    return (
      <Stack className="chat-view">
        <ChatLoadingState label={t("chat.creating")} fillView />
      </Stack>
    );
  }

  if (chatStore === null) {
    return (
      <Stack className="chat-view">
        <ChatEmptyState projectStore={projectStore} />
      </Stack>
    );
  }

  const currentThread = chatStore.thread;
  const isLoadingCurrentThread = projectStore.loadingThreadId === currentThread.id && chatStore.turns.length === 0;
  const messageContent = isLoadingCurrentThread ? (
    <ChatLoadingState label={t("chat.loading")} />
  ) : (
    <ChatMessageListX store={store} chatStore={chatStore} />
  );

  return (
    <Stack className="chat-view">
      <ChatHeaderX projectStore={projectStore} chatStore={chatStore} />
      {isOrphanProject ? (
        <Alert
          severity="warning"
          action={(
            <Button color="inherit" size="small" onClick={handleOpenSources}>
              {t("sources.title")}
            </Button>
          )}
        >
          {t("project.orphanSource")}
        </Alert>
      ) : null}
      {messageContent}
      {isOrphanProject ? null : (
        <ChatComposer
          store={store}
          chatStore={chatStore}
          selectedModel={appStore.selectedModel}
          reasoningEffort={appStore.reasoningEffort}
          modelOptions={appStore.modelOptions}
          isWorking={
            chatStore.isWorking ||
            chatStore.isStartingTurn ||
            chatStore.isRecovering ||
            projectStore.loadingThreadId !== null
          }
        />
      )}
    </Stack>
  );
}

export const ChatViewX = observer(ChatView);
