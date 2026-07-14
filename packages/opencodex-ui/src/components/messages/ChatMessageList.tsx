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
  OpenCodexReasoningEffort
} from "@open-codex-ui/opencodex-protocol";

import type {
  ChatStore,
  ChatTimelineViewState
} from "../../stores/ChatStore";
import type { RootStore } from "../../stores/RootStore";
import { ModelSettingsFields } from "../chat/ModelSettingsFields";
import { ChatTurnViewX } from "./ChatTurnView";
import {
  getVisibleTurns,
  INITIAL_VISIBLE_TURN_COUNT,
  resolveRestoredVisibleTurnCount,
  TURN_WINDOW_INCREMENT
} from "./chatTimelineWindow";

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
  const contentRef = useRef<HTMLDivElement | null>(null);
  const lastMessageRef = useRef<HTMLElement | null>(null);
  const previousScrollStateRef = useRef<{ height: number; top: number } | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const previousOlderMessagesRevealVersionRef = useRef(chatStore.olderMessagesPrependVersion);
  const previousTurnCountRef = useRef(chatStore.turns.length);
  const resizeFrameRef = useRef<number | null>(null);
  const restorationFrameRef = useRef<number | null>(null);
  const pendingTimelineRestorationRef = useRef<ChatTimelineViewState | null>(null);
  const visibleTurnCountRef = useRef(INITIAL_VISIBLE_TURN_COUNT);
  const currentThread = chatStore.thread;
  const editableItem = chatStore.editableLastUserItemIdentity;
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [visibleTurnCount, setVisibleTurnCount] = useState(INITIAL_VISIBLE_TURN_COUNT);
  visibleTurnCountRef.current = visibleTurnCount;
  const visibleTurnStores = getVisibleTurns(chatStore.turnStores, visibleTurnCount);
  const hiddenOlderTurnCount = Math.max(chatStore.turnStores.length - visibleTurnCount, 0);
  const isWorking = chatStore.isWorking || chatStore.isStartingTurn;
  const handleOpenLink = useCallback((href: string) => {
    store.openExternalLink(href);
  }, [store]);

  useEffect(() => {
    setEditedMessage(null);
    previousTurnCountRef.current = chatStore.turns.length;
    const savedViewState = chatStore.timelineViewState;

    if (savedViewState === null) {
      setVisibleTurnCount(INITIAL_VISIBLE_TURN_COUNT);
      return undefined;
    }

    pendingTimelineRestorationRef.current = savedViewState;
    restorationFrameRef.current = requestAnimationFrame(() => {
      restorationFrameRef.current = requestAnimationFrame(() => {
        restorationFrameRef.current = null;
        const pendingState = pendingTimelineRestorationRef.current;

        if (pendingState === null) {
          return;
        }

        const restoredVisibleTurnCount = resolveRestoredVisibleTurnCount(
          pendingState.visibleTurnCount,
          pendingState.turnCount,
          chatStore.turnStores.length
        );

        if (restoredVisibleTurnCount !== visibleTurnCountRef.current) {
          setVisibleTurnCount(restoredVisibleTurnCount);
          return;
        }

        const container = containerRef.current;

        if (container === null) {
          return;
        }

        pendingTimelineRestorationRef.current = null;
        const isPinnedToBottom = restoreTimelinePosition(container, pendingState);
        shouldStickToBottomRef.current = isPinnedToBottom;
        setShowScrollToBottom(!isPinnedToBottom);
      });
    });

    return () => {
      if (restorationFrameRef.current === null) {
        return;
      }

      cancelAnimationFrame(restorationFrameRef.current);
      restorationFrameRef.current = null;
    };
  }, [chatStore, chatStore.thread.id]);

  useLayoutEffect(() => {
    return () => {
      const container = containerRef.current;

      if (
        container === null ||
        pendingTimelineRestorationRef.current !== null
      ) {
        return;
      }

      chatStore.setTimelineViewState({
        visibleTurnCount: visibleTurnCountRef.current,
        turnCount: chatStore.turnStores.length,
        scrollTop: container.scrollTop,
        isPinnedToBottom: shouldStickToBottomRef.current
      });
    };
  }, [chatStore]);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;

    if (container === null || content === null || typeof ResizeObserver === "undefined") {
      return undefined;
    }

    const resizeObserver = new ResizeObserver(() => {
      if (
        !shouldStickToBottomRef.current ||
        previousScrollStateRef.current !== null ||
        resizeFrameRef.current !== null
      ) {
        return;
      }

      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        const currentContainer = containerRef.current;

        if (
          currentContainer === null ||
          !shouldStickToBottomRef.current ||
          previousScrollStateRef.current !== null
        ) {
          return;
        }

        scrollToBottom(currentContainer);
      });
    });

    resizeObserver.observe(container);
    resizeObserver.observe(content);

    return () => {
      resizeObserver.disconnect();

      if (resizeFrameRef.current === null) {
        return;
      }

      cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = null;
    };
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

  function handleServiceTierChange(value: string | null): void {
    chatStore.setSelectedServiceTier(value);
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
    const pendingRestoration = pendingTimelineRestorationRef.current;

    if (container !== null && pendingRestoration !== null) {
      pendingTimelineRestorationRef.current = null;
      const isPinnedToBottom = restoreTimelinePosition(container, pendingRestoration);
      shouldStickToBottomRef.current = isPinnedToBottom;
      setShowScrollToBottom(!isPinnedToBottom);
      return;
    }

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
          {visibleTurnStores.map((turnStore, index) => (
            <ChatTurnViewX
              key={turnStore.id}
              turnStore={turnStore}
              activeTurnId={chatStore.activeTurnId}
              isWorking={isWorking}
              isLastTurn={index === visibleTurnStores.length - 1}
              editableItem={editableItem}
              lastMessageRef={lastMessageRef}
              onOpenLink={handleOpenLink}
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

const BOTTOM_SCROLL_THRESHOLD_PX = 4;

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
 * Restores a retained timeline position after its bounded first frame.
 *
 * @param container Message scroll container.
 * @param state Previously retained reading state.
 * @returns Whether the restored position is pinned to the bottom.
 */
function restoreTimelinePosition(
  container: HTMLDivElement,
  state: ChatTimelineViewState
): boolean {
  if (state.isPinnedToBottom) {
    scrollToBottom(container);
    return true;
  }

  container.scrollTop = Math.max(state.scrollTop, 0);
  return isAtBottom(container);
}
