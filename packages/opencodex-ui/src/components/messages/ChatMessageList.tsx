/**
 * Renders the chat message list component for the OpenCodex UI.
 */
import { observer } from "mobx-react-lite";
import ArrowDownwardRoundedIcon from "@mui/icons-material/ArrowDownwardRounded";
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent
} from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexReasoningEffort
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../stores/ChatStore";
import type { RootStore } from "../../stores/RootStore";
import { ModelSettingsFields } from "../chat/ModelSettingsFields";
import { ChatTurnViewX } from "./ChatTurnView";
import { CollaborationEventList } from "./CollaborationEventCard";
import { getVisibleTurns } from "./chatTimelineWindow";
import { buildCollaborationTimeline } from "./collaborationTimeline";
import type { OpenSubAgentDialog } from "../threads/subAgentDialog";
import { useChatTimelineScroll } from "./useChatTimelineScroll";

type ChatMessageListProps = {
  store: RootStore;
  chatStore: ChatStore;
  onOpenSubAgentDialog: OpenSubAgentDialog;
};

/**
 * Renders the chat message list component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ChatMessageList({
  store,
  chatStore,
  onOpenSubAgentDialog
}: ChatMessageListProps) {
  const { t } = useTranslation();
  const lastMessageRef = useRef<HTMLElement | null>(null);
  const currentThread = chatStore.thread;
  const editableItem = chatStore.editableLastUserItemIdentity;
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const isWorking = chatStore.isWorking || chatStore.isStartingTurn;
  const sourceId = chatStore.sourceId;
  const collaborationEvents = sourceId === null
    ? []
    : store.collaborationStore.readThreadEvents(sourceId, currentThread.id);
  const collaborationTimeline = buildCollaborationTimeline(
    collaborationEvents,
    currentThread.id
  );
  const handleOpenLink = useCallback((href: string) => {
    store.openExternalLink(href);
  }, [store]);
  const handleNavigateThread = useCallback((threadId: string) => {
    onOpenSubAgentDialog(currentThread, threadId);
  }, [currentThread, onOpenSubAgentDialog]);

  useEffect(() => {
    if (sourceId === null) {
      return;
    }

    void store.collaborationStore
      .loadThreadEvents(sourceId, currentThread.id)
      .catch(() => undefined);
  }, [currentThread.id, sourceId, store]);

  useEffect(() => {
    setEditedMessage(null);
  }, [chatStore, chatStore.thread.id]);

  const {
    containerRef,
    contentRef,
    visibleTurnCount,
    hiddenOlderTurnCount,
    showScrollToBottom,
    handleScroll,
    handleScrollToBottom
  } = useChatTimelineScroll(chatStore);
  const visibleTurnStores = getVisibleTurns(chatStore.turnStores, visibleTurnCount);

  function handleStartEdit(content: string): void {
    setEditedMessage(content);
  }

  function handleCancelEdit(): void {
    setEditedMessage(null);
  }

  function handleEditChange(event: ChangeEvent<HTMLInputElement>): void {
    setEditedMessage(event.target.value);
  }

  function handleModelChange(value: string | null): void {
    chatStore.setSelectedModel(value);
  }

  function handleEffortChange(value: OpenCodexReasoningEffort): void {
    chatStore.setReasoningEffort(value);
  }

  function handleServiceTierChange(value: string | null): void {
    chatStore.setSelectedServiceTier(value);
  }

  function handleSubmitEdit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitEditMessage();
  }

  function handleEditKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    if (!event.ctrlKey || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitEditMessage();
  }

  function submitEditMessage(): void {
    if (editedMessage === null) {
      return;
    }

    const submittedMessage = editedMessage;
    const submittedAttachments = chatStore.editableLastUserItem?.attachments ?? [];
    const submittedModel = chatStore.selectedModel;
    const submittedReasoningEffort = chatStore.reasoningEffort;
    const submittedServiceTier = chatStore.selectedServiceTier;

    flushSync(() => {
      setEditedMessage(null);
    });

    const wasAccepted = chatStore.editLastTurn(
      submittedMessage,
      submittedAttachments,
      submittedModel,
      submittedReasoningEffort,
      [],
      submittedServiceTier
    );

    if (!wasAccepted) {
      setEditedMessage(submittedMessage);
    }
  }

  return (
    <Box
      sx={{
        display: "flex",
        position: "relative",
        minHeight: 0,
        minWidth: 0,
        width: "100%",
        maxWidth: "100%",
        flex: "1 1 auto"
      }}
    >
      <Box
        ref={containerRef}
        onScroll={handleScroll}
        sx={{
          display: "flex",
          flex: "1 1 auto",
          flexDirection: "column",
          alignItems: "stretch",
          minHeight: 0,
          minWidth: 0,
          width: "100%",
          maxWidth: "100%",
          overflowX: "hidden",
          overflowY: "auto",
          px: 2,
          py: 2.25
        }}
      >
        <Box
          ref={contentRef}
          sx={{
            display: "flex",
            flex: "0 0 auto",
            flexDirection: "column",
            alignItems: "stretch",
            gap: 1.25,
            minWidth: 0,
            width: "100%"
          }}
        >
          {chatStore.isLoadingOlderMessages ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
              <CircularProgress size={18} thickness={5} />
            </Box>
          ) : null}
          <CollaborationEventList
            events={collaborationTimeline.threadEvents}
            currentThread={currentThread}
            isThreadContext
            onNavigateThread={handleNavigateThread}
          />
          {visibleTurnStores.map((turnStore, index) => (
            <ChatTurnViewX
              key={turnStore.id}
              turnStore={turnStore}
              activeTurnId={chatStore.activeTurnId}
              isWorking={isWorking}
              isLastTurn={index === visibleTurnStores.length - 1}
              editableItem={editableItem}
              collaborationEvents={collaborationTimeline.eventsByTurnId.get(turnStore.id) ?? []}
              currentThread={currentThread}
              lastMessageRef={lastMessageRef}
              onOpenLink={handleOpenLink}
              onNavigateThread={handleNavigateThread}
              onStartEdit={handleStartEdit}
            />
          ))}
          <Box
            aria-hidden="true"
            sx={{
              width: 1,
              height: "1px",
              mt: "-1px",
              flex: "0 0 auto",
              overflow: "hidden",
              pointerEvents: "none"
            }}
          />
        </Box>
      </Box>
      <Tooltip title={t("chat.scrollToBottom")}>
        <Box
          component="span"
          sx={{
            position: "absolute",
            right: 30,
            bottom: 0,
            zIndex: 3,
            height: 80,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "center",
            width: 64,
            overflow: "hidden",
            pointerEvents: showScrollToBottom ? "auto" : "none",
          }}
        >
          <IconButton
            aria-label={t("chat.scrollToBottom")}
            className="scroll-to-bottom-button"
            color="primary"
            size="large"
            onClick={handleScrollToBottom}
            sx={{
              bgcolor: "#ffffff",
              boxShadow: 4,
              color: "primary.main",
              animation: showScrollToBottom
                ? "opencodex-scroll-button-rise 360ms cubic-bezier(0.22, 1, 0.36, 1)"
                : "none",
              mt: 2,
              opacity: 0.7,
              transform: showScrollToBottom ? "translateY(0)" : "translateY(64px)",
              transition: "opacity 160ms ease, background-color 160ms ease, transform 180ms ease",
              "&:hover": {
                bgcolor: "#ffffff",
                opacity: 1
              }
            }}
          >
            <ArrowDownwardRoundedIcon />
          </IconButton>
        </Box>
      </Tooltip>
      <Dialog open={editedMessage !== null} fullWidth maxWidth="md" onClose={handleCancelEdit}>
        <Box component="form" onSubmit={handleSubmitEdit}>
          <DialogTitle>{t("message.editLast")}</DialogTitle>
          <DialogContent dividers>
            <TextField
              value={editedMessage ?? ""}
              autoFocus
              multiline
              minRows={6}
              fullWidth
              onChange={handleEditChange}
              onKeyDown={handleEditKeyDown}
            />
          </DialogContent>
          <DialogActions
            sx={{
              alignItems: "center",
              gap: 1,
              justifyContent: "space-between",
              px: 3
            }}
          >
            <ModelSettingsFields
              selectedModel={chatStore.selectedModel}
              reasoningEffort={chatStore.reasoningEffort}
              reasoningEfforts={store.appStore.getReasoningEffortOptions(chatStore.selectedModel)}
              selectedServiceTier={chatStore.selectedServiceTier}
              modelOptions={store.appStore.modelOptions}
              serviceTierOptions={store.appStore.getServiceTierOptions(chatStore.selectedModel)}
              onModelChange={handleModelChange}
              onReasoningEffortChange={handleEffortChange}
              onServiceTierChange={handleServiceTierChange}
            />
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button type="button" onClick={handleCancelEdit}>
                {t("message.cancelEdit")}
              </Button>
              <Button variant="contained" type="submit">
                {t("message.submitEdit")}
              </Button>
            </Box>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  );
}

export const ChatMessageListX = observer(ChatMessageList);
