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
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent,
  type UIEvent
} from "react";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexReasoningEffort,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../stores/ChatStore";
import type { RootStore } from "../../stores/RootStore";
import { ModelSettingsFields } from "../chat/ModelSettingsFields";
import { ChatTurnViewX } from "./ChatTurnView";

type ChatMessageListProps = {
  store: RootStore;
  chatStore: ChatStore;
};

/**
 * Renders the chat message list component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ChatMessageList({ store, chatStore }: ChatMessageListProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastMessageRef = useRef<HTMLElement | null>(null);
  const previousScrollStateRef = useRef<{ height: number; top: number } | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousOlderMessagesPrependVersionRef = useRef(chatStore.olderMessagesPrependVersion);
  const previousOlderMessagesRevealVersionRef = useRef(chatStore.olderMessagesPrependVersion);
  const previousThreadIdRef = useRef(chatStore.thread.id);
  const previousTurnCountRef = useRef(chatStore.turns.length);
  const stickToBottomFrameRef = useRef<number | null>(null);
  const currentThread = chatStore.thread;
  const editableItem = chatStore.editableLastUserItemIdentity;
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [visibleTurnCount, setVisibleTurnCount] = useState(INITIAL_VISIBLE_TURN_COUNT);
  const visibleTurns = getVisibleTurns(chatStore.turns, visibleTurnCount);
  const hiddenOlderTurnCount = Math.max(chatStore.turns.length - visibleTurnCount, 0);
  const isWorking = chatStore.isWorking || chatStore.isStartingTurn;
  const handleOpenLink = useCallback((href: string) => {
    store.openExternalLink(href);
  }, [store]);
  const handleLastTurnLayoutChange = useCallback(() => {
    const container = containerRef.current;

    if (container === null || !shouldStickToBottomRef.current) {
      return;
    }

    scrollToBottom(container);

    if (stickToBottomFrameRef.current !== null) {
      return;
    }

    stickToBottomFrameRef.current = requestAnimationFrame(() => {
      stickToBottomFrameRef.current = null;

      if (containerRef.current === null || !shouldStickToBottomRef.current) {
        return;
      }

      scrollToBottom(containerRef.current);
    });
  }, []);

  useEffect(() => {
    setEditedMessage(null);
    setVisibleTurnCount(INITIAL_VISIBLE_TURN_COUNT);
    previousTurnCountRef.current = chatStore.turns.length;
  }, [chatStore.thread.id]);

  useEffect(() => () => {
    if (stickToBottomFrameRef.current === null) {
      return;
    }

    cancelAnimationFrame(stickToBottomFrameRef.current);
    stickToBottomFrameRef.current = null;
  }, []);

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

  function handleSubmitEdit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitEditMessage();
  }

  function handleScrollToBottom(): void {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    scrollToBottom(container);
    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
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

    flushSync(() => {
      setEditedMessage(null);
    });

    const wasAccepted = chatStore.editLastTurn(
      submittedMessage,
      submittedAttachments,
      submittedModel,
      submittedReasoningEffort
    );

    if (!wasAccepted) {
      setEditedMessage(submittedMessage);
    }
  }

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      scrollToBottom(container);
      shouldStickToBottomRef.current = true;
      setShowScrollToBottom(false);
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [currentThread.id, chatStore.scrollToBottomVersion]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const previousState = previousScrollStateRef.current;

    if (container === null || previousState === null) {
      return;
    }

    container.scrollTop = container.scrollHeight - previousState.height + previousState.top;
    const isPinnedToBottom = isAtBottom(container);
    shouldStickToBottomRef.current = isPinnedToBottom;
    setShowScrollToBottom(!isPinnedToBottom);
    previousScrollStateRef.current = null;
  }, [chatStore.olderMessagesPrependVersion, visibleTurnCount]);

  useLayoutEffect(() => {
    const didPrependOlderMessages = (
      previousOlderMessagesRevealVersionRef.current !== chatStore.olderMessagesPrependVersion
    );
    const previousTurnCount = previousTurnCountRef.current;

    previousOlderMessagesRevealVersionRef.current = chatStore.olderMessagesPrependVersion;
    previousTurnCountRef.current = chatStore.turns.length;

    if (!didPrependOlderMessages) {
      return;
    }

    const addedTurnCount = Math.max(chatStore.turns.length - previousTurnCount, 0);

    if (addedTurnCount === 0) {
      return;
    }

    setVisibleTurnCount((currentCount) => (
      Math.min(chatStore.turns.length, currentCount + addedTurnCount)
    ));
  }, [chatStore.olderMessagesPrependVersion, chatStore.turns.length]);

  useLayoutEffect(() => {
    const container = containerRef.current;

    if (container === null) {
      return;
    }

    const didChangeThread = previousThreadIdRef.current !== currentThread.id;
    const didPrependOlderMessages = (
      previousOlderMessagesPrependVersionRef.current !== chatStore.olderMessagesPrependVersion
    );

    previousThreadIdRef.current = currentThread.id;
    previousOlderMessagesPrependVersionRef.current = chatStore.olderMessagesPrependVersion;

    if (didChangeThread || didPrependOlderMessages || !shouldStickToBottomRef.current) {
      return;
    }

    scrollToBottom(container);
  });

  function handleScroll(event: UIEvent<HTMLDivElement>): void {
    const container = event.currentTarget;
    const isPinnedToBottom = isAtBottom(container);
    shouldStickToBottomRef.current = isPinnedToBottom;
    setShowScrollToBottom(!isPinnedToBottom);

    if (
      container.scrollTop > 80 ||
      chatStore.isLoadingOlderMessages
    ) {
      return;
    }

    if (hiddenOlderTurnCount > 0) {
      previousScrollStateRef.current = {
        height: container.scrollHeight,
        top: container.scrollTop
      };
      setVisibleTurnCount((currentCount) => (
        Math.min(chatStore.turns.length, currentCount + TURN_WINDOW_INCREMENT)
      ));
      return;
    }

    if (!chatStore.hasMoreOlderMessages) {
      return;
    }

    previousScrollStateRef.current = {
      height: container.scrollHeight,
      top: container.scrollTop
    };
    chatStore.loadOlderMessages();
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
          gap: 1.25,
          px: 2,
          py: 2.25
        }}
      >
        {chatStore.isLoadingOlderMessages ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
            <CircularProgress size={18} thickness={5} />
          </Box>
        ) : null}
        {visibleTurns.map((turn, index) => (
          <ChatTurnViewX
            key={turn.id}
            turn={turn}
            activeTurnId={chatStore.activeTurnId}
            isWorking={isWorking}
            isLastTurn={index === visibleTurns.length - 1}
            editableItem={editableItem}
            lastMessageRef={lastMessageRef}
            onOpenLink={handleOpenLink}
            onStartEdit={handleStartEdit}
            onContentLayoutChange={handleLastTurnLayoutChange}
          />
        ))}
        {chatStore.isSyncing && chatStore.turns.length > 0 ? (
          <Box
            sx={{
              alignItems: "center",
              color: "text.secondary",
              display: "flex",
              gap: 1,
              justifyContent: "center",
              py: 1
            }}
          >
            <CircularProgress size={16} thickness={5} />
            <Typography variant="caption">
              {chatStore.isRecovering ? t("chat.recovering") : t("chat.syncing")}
            </Typography>
          </Box>
        ) : null}
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
              modelOptions={store.appStore.modelOptions}
              onModelChange={handleModelChange}
              onReasoningEffortChange={handleEffortChange}
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

const BOTTOM_SCROLL_THRESHOLD_PX = 4;
const INITIAL_VISIBLE_TURN_COUNT = 10;
const TURN_WINDOW_INCREMENT = 10;

/**
 * Scrolls a message container to its bottom edge.
 *
 * @param container Message scroll container.
 *
 * @returns Nothing.
 */
function scrollToBottom(container: HTMLDivElement): void {
  container.scrollTop = container.scrollHeight;
}

/**
 * Checks whether the user is at the bottom edge.
 *
 * @param container Message scroll container.
 *
 * @returns `true` when the latest message is effectively visible.
 */
function isAtBottom(container: HTMLDivElement): boolean {
  const remainingScroll = container.scrollHeight - container.scrollTop - container.clientHeight;
  return remainingScroll <= BOTTOM_SCROLL_THRESHOLD_PX;
}

/**
 * Returns the bounded turn window rendered by the timeline.
 *
 * @param turns Loaded chat turns.
 * @param visibleTurnCount Maximum number of recent turns to render.
 *
 * @returns Visible turn window.
 */
function getVisibleTurns(turns: OpenCodexTurn[], visibleTurnCount: number): OpenCodexTurn[] {
  if (turns.length <= visibleTurnCount) {
    return turns;
  }

  return turns.slice(-visibleTurnCount);
}
