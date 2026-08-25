/**
 * Renders the chat view component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import { Alert, Button, Stack } from "@mui/material";
import { useTranslation } from "react-i18next";

import type { RootStore } from "../../stores/RootStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ChatComposerX } from "./ChatComposer";
import { ChatHeaderX } from "./ChatHeader";
import { ChatMessageListX } from "../messages/ChatMessageList";
import { ChatEmptyStateX } from "./ChatEmptyState";
import { ChatLoadingState } from "./ChatLoadingState";
import type { OpenSubAgentDialog } from "../threads/subAgentDialog";

type ChatViewProps = {
  store: RootStore;
  projectStore: ProjectStore;
  onOpenSubAgentDialog: OpenSubAgentDialog;
};

/**
 * Renders the chat view component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ChatView({ store, projectStore, onOpenSubAgentDialog }: ChatViewProps) {
  const { t } = useTranslation();
  const chatStore = projectStore.selectedChat;
  const isReadOnlyProject = projectStore.isReadOnlyFromCache;
  const readOnlyMessage = projectStore.isOrphan
    ? t("project.orphanSource")
    : t("project.codexSourceUnavailable");

  function handleOpenSources(): void {
    store.openSourcesHome();
  }

  if (projectStore.threadListStore.isCreatingThread) {
    return (
      <Stack className="chat-view">
        <ChatLoadingState label={t("chat.creating")} fillView />
      </Stack>
    );
  }

  if (chatStore === null) {
    return (
      <Stack className="chat-view chat-view-empty">
        <ChatEmptyStateX projectStore={projectStore} />
      </Stack>
    );
  }

  const currentThread = chatStore.thread;
  const isLoadingCurrentThread = projectStore.threadListStore.loadingThreadId === currentThread.id
    && chatStore.timeline.turns.length === 0;
  const messageContent = isLoadingCurrentThread ? (
    <ChatLoadingState label={t("chat.loading")} />
  ) : (
    <ChatMessageListX
      store={store}
      chatStore={chatStore}
      onOpenSubAgentDialog={onOpenSubAgentDialog}
    />
  );

  return (
    <Stack className="chat-view">
      <ChatHeaderX projectStore={projectStore} chatStore={chatStore} />
      {isReadOnlyProject ? (
        <Alert
          severity="warning"
          action={(
            <Button color="inherit" size="small" onClick={handleOpenSources}>
              {t("sources.title")}
            </Button>
          )}
        >
          {readOnlyMessage}
        </Alert>
      ) : null}
      {messageContent}
      {isReadOnlyProject ? null : (
        <ChatComposerX
          store={store}
          chatStore={chatStore}
          projectStore={projectStore}
          modelOptions={store.appStore.modelOptions}
          isWorking={
            chatStore.runtime.isWorking ||
            chatStore.runtime.isStartingTurn ||
            chatStore.runtime.isRecovering ||
            projectStore.threadListStore.loadingThreadId !== null
          }
        />
      )}
    </Stack>
  );
}

export const ChatViewX = observer(ChatView);
