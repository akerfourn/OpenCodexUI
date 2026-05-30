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
  OpenCodexTurn,
  OpenCodexTurnItem
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../stores/ChatStore";
import type { RootStore } from "../../stores/RootStore";
import { ModelSettingsFields } from "../chat/ModelSettingsFields";
import { AssistantTurnBlock } from "./AssistantTurnBlock";
import { MessageRowM } from "./MessageRow";
import { isPreludeItem } from "./turnItemFilters";

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
  const currentThread = chatStore.thread;
  const editableItem = chatStore.editableLastUserItem;
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [visibleTurnCount, setVisibleTurnCount] = useState(INITIAL_VISIBLE_TURN_COUNT);
  const visibleTurns = getVisibleTurns(chatStore.turns, visibleTurnCount);
  const hiddenOlderTurnCount = Math.max(chatStore.turns.length - visibleTurnCount, 0);
  const entries = buildTimelineEntries(
    visibleTurns,
    chatStore.activeTurnId,
    chatStore.isWorking || chatStore.isStartingTurn
  );
  const handleOpenLink = useCallback((href: string) => {
    store.openExternalLink(href);
  }, [store]);

  useEffect(() => {
    setEditedMessage(null);
    setVisibleTurnCount(INITIAL_VISIBLE_TURN_COUNT);
    previousTurnCountRef.current = chatStore.turns.length;
  }, [chatStore.thread.id]);

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
    const submittedAttachments = editableItem?.attachments ?? [];
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
        {entries.map((entry, index) => {
          const isLast = index === entries.length - 1;

          if (entry.type === "turnPrelude") {
            return (
              <AssistantTurnBlock
                key={entry.key}
                turn={entry.turn}
                preludeItems={entry.items}
                isRunning={entry.isRunning}
                lastMessageRef={lastMessageRef}
                isLast={isLast}
                onOpenLink={handleOpenLink}
              />
            );
          }

          return (
            <MessageRowM
              key={entry.key}
              isLast={isLast}
              lastMessageRef={lastMessageRef}
              onOpenLink={handleOpenLink}
              role={entry.item.role}
              phase={entry.item.phase}
              kind={entry.item.kind}
              content={entry.item.content}
              createdAt={entry.item.createdAt ?? entry.turn.completedAt ?? entry.turn.startedAt}
              details={entry.item.details}
              attachments={entry.item.attachments ?? []}
              canEdit={isEditableTimelineItem(entry, editableItem)}
              onEdit={() => handleStartEdit(entry.item.content)}
            />
          );
        })}
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

type TimelineEntry =
  | { type: "item"; key: string; turn: OpenCodexTurn; item: OpenCodexTurnItem }
  | {
      type: "turnPrelude";
      key: string;
      turn: OpenCodexTurn;
      items: OpenCodexTurnItem[];
      isRunning: boolean;
    };

const BOTTOM_SCROLL_THRESHOLD_PX = 4;
const INITIAL_VISIBLE_TURN_COUNT = 10;
const TURN_WINDOW_INCREMENT = 10;

function isEditableTimelineItem(
  entry: TimelineEntry,
  editableItem: { turnId: string; itemId: string; content: string } | null
): boolean {
  if (entry.type !== "item" || editableItem === null) {
    return false;
  }

  return entry.turn.id === editableItem.turnId && entry.item.id === editableItem.itemId;
}

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

/**
 * Builds timeline entries.
 *
 * @param turns Turn collection to process.
 * @param activeTurnId Active turn identifier.
 * @param isWorking Is working.
 *
 * @returns Requested values.
 */
function buildTimelineEntries(
  turns: OpenCodexTurn[],
  activeTurnId: string | null,
  isWorking: boolean
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const turn of turns) {
    const isRunning = isTurnRunning(turn, activeTurnId, isWorking);
    const finalAssistantContents = buildFinalAssistantContentSet(turn.items);
    const pendingPreludeItems: OpenCodexTurnItem[] = [];
    let preludeGroupIndex = 0;

    for (const item of turn.items) {
      if (isVisiblePreludeItem(item, finalAssistantContents)) {
        if (appendPreludeBeforeTrailingFinal(entries, turn, item)) {
          continue;
        }

        pendingPreludeItems.push(item);
        continue;
      }

      preludeGroupIndex = flushPreludeItems(
        entries,
        turn,
        pendingPreludeItems,
        preludeGroupIndex,
        false
      );

      entries.push({
        type: "item",
        key: buildItemKey(turn, item, entries.length),
        turn,
        item
      });
    }

    flushPreludeItems(
      entries,
      turn,
      pendingPreludeItems,
      preludeGroupIndex,
      isRunning
    );
  }

  return entries;
}

function buildFinalAssistantContentSet(items: OpenCodexTurnItem[]): Set<string> {
  return new Set(
    items
      .filter((item) => item.role === "assistant" && item.phase === "final_answer")
      .map((item) => normalizeContent(item.content))
      .filter((content) => content.length > 0)
  );
}

function isVisiblePreludeItem(
  item: OpenCodexTurnItem,
  finalAssistantContents: Set<string>
): boolean {
  if (!isPreludeItem(item)) {
    return false;
  }

  if (item.role !== "assistant" || item.phase !== "commentary") {
    return true;
  }

  const content = normalizeContent(item.content);
  return content.length === 0 || !finalAssistantContents.has(content);
}

function appendPreludeBeforeTrailingFinal(
  entries: TimelineEntry[],
  turn: OpenCodexTurn,
  item: OpenCodexTurnItem
): boolean {
  const lastEntry = entries[entries.length - 1];

  if (!isFinalAssistantEntry(lastEntry, turn)) {
    return false;
  }

  const preludeEntry = findPreviousPreludeEntry(entries, turn);

  if (preludeEntry !== null) {
    preludeEntry.items.push(item);
    return true;
  }

  entries.splice(entries.length - 1, 0, {
    type: "turnPrelude",
    key: buildTurnPreludeKey(turn, 0, entries.length),
    turn,
    items: [item],
    isRunning: false
  });

  return true;
}

function isFinalAssistantEntry(
  entry: TimelineEntry | undefined,
  turn: OpenCodexTurn
): entry is Extract<TimelineEntry, { type: "item" }> {
  if (entry === undefined || entry.type !== "item" || entry.turn.id !== turn.id) {
    return false;
  }

  return entry.item.role === "assistant" && entry.item.phase === "final_answer";
}

function findPreviousPreludeEntry(
  entries: TimelineEntry[],
  turn: OpenCodexTurn
): Extract<TimelineEntry, { type: "turnPrelude" }> | null {
  for (let index = entries.length - 2; index >= 0; index -= 1) {
    const entry = entries[index];

    if (entry === undefined || entry.turn.id !== turn.id) {
      return null;
    }

    if (entry.type === "turnPrelude") {
      return entry;
    }
  }

  return null;
}

function normalizeContent(content: string): string {
  return content.trim().replace(/\s+/g, " ");
}

function flushPreludeItems(
  entries: TimelineEntry[],
  turn: OpenCodexTurn,
  pendingPreludeItems: OpenCodexTurnItem[],
  preludeGroupIndex: number,
  isRunning: boolean
): number {
  if (pendingPreludeItems.length === 0 && !isRunning) {
    return preludeGroupIndex;
  }

  entries.push({
    type: "turnPrelude",
    key: buildTurnPreludeKey(turn, preludeGroupIndex, entries.length),
    turn,
    items: [...pendingPreludeItems],
    isRunning
  });
  pendingPreludeItems.length = 0;

  return preludeGroupIndex + 1;
}

/**
 * Checks whether turn running.
 *
 * @param turn Turn payload to process.
 * @param activeTurnId Active turn identifier.
 * @param isWorking Is working.
 *
 * @returns `true` when the condition is met.
 */
function isTurnRunning(turn: OpenCodexTurn, activeTurnId: string | null, isWorking: boolean): boolean {
  if (!isWorking) {
    return false;
  }

  const hasFinalAnswer = turn.items.some(
    (item) => item.role === "assistant" && item.phase === "final_answer"
  );

  if (hasFinalAnswer) {
    return false;
  }

  return turn.id === activeTurnId || turn.id.startsWith("pending:");
}

/**
 * Checks whether prelude item.
 *
 * @param item Item payload.
 *
 * @returns `true` when the condition is met.
 */
/**
 * Builds turn prelude key.
 *
 * @param turn Turn payload to process.
 * @param index Index.
 *
 * @returns Computed string value.
 */
function buildTurnPreludeKey(turn: OpenCodexTurn, groupIndex: number, index: number): string {
  return [
    "turnPrelude",
    turn.id.length > 0 ? turn.id : "no-turn",
    groupIndex,
    index
  ].join(":");
}

/**
 * Builds item key.
 *
 * @param turn Turn payload to process.
 * @param item Item payload.
 * @param index Index.
 *
 * @returns Computed string value.
 */
function buildItemKey(turn: OpenCodexTurn, item: OpenCodexTurnItem, index: number): string {
  return [
    "turnItem",
    turn.id,
    item.role,
    item.phase ?? "none",
    item.kind ?? "none",
    item.id,
    index
  ].join(":");
}
