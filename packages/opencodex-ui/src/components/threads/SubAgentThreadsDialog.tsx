/**
 * Renders a readonly dialog for sub-agent threads spawned by a parent chat.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexCollaborationEvent,
  OpenCodexThread,
  OpenCodexTurn
} from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "../../stores/project/ProjectStore";
import { ChatTurnStore } from "../../stores/chat/ChatTurnStore";
import { ChatTurnViewX } from "../messages/ChatTurnView";
import { CollaborationEventList } from "../messages/CollaborationEventCard";
import { buildCollaborationTimeline } from "../messages/collaborationTimeline";
import { SubAgentThreadHeader } from "./SubAgentThreadHeader";
import { SubAgentThreadTree } from "./SubAgentThreadTree";
import {
  buildSubAgentThreadTree,
  createSourceThreadKey,
  findFirstSubAgentThreadId,
  type SubAgentThreadTreeNode
} from "./subAgentThreadTree";

type SubAgentThreadsDialogProps = {
  open: boolean;
  parentThread: OpenCodexThread;
  initialSelectedThreadId?: string | null;
  projectStore: ProjectStore;
  onClose(): void;
};

type ReadonlyThreadView = {
  thread: OpenCodexThread;
  turns: OpenCodexTurn[];
};

/**
 * Renders sub-agent thread navigation and readonly message content.
 *
 * @param props Component props.
 *
 * @returns Dialog element.
 */
export function SubAgentThreadsDialog({
  open,
  parentThread,
  initialSelectedThreadId = null,
  projectStore,
  onClose
}: SubAgentThreadsDialogProps) {
  const { t } = useTranslation();
  const threadListStore = projectStore.threadListStore;
  const subAgentStore = threadListStore.subAgentStore;
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    initialSelectedThreadId
  );
  const [threadView, setThreadView] = useState<ReadonlyThreadView | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(open);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const readonlyThreadViewsRef = useRef(new Map<string, ReadonlyThreadView>());
  const sourceId = parentThread.sourceId;
  const threads = subAgentStore.read(parentThread.id, sourceId);
  const treeNodes = buildSubAgentThreadTree(parentThread, threads, sourceId);
  const turnStores = useMemo(() => (
    threadView?.turns.map((turn) => new ChatTurnStore(turn)) ?? []
  ), [threadView?.turns]);
  const currentThread = threadView === null
    ? null
    : threads.find((thread) => thread.id === threadView.thread.id) ?? threadView.thread;
  const selectedThreadSourceId = currentThread?.sourceId ?? sourceId;
  const collaborationEvents = currentThread === null || selectedThreadSourceId === null
    ? []
    : subAgentStore.readCollaborationEvents(
      selectedThreadSourceId,
      currentThread.id
    );
  const collaborationTimeline = buildCollaborationTimeline(
    collaborationEvents,
    currentThread?.id ?? ""
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    let isCancelled = false;
    setIsLoadingList(true);
    setThreadView(null);
    setSelectedThreadId(initialSelectedThreadId);
    readonlyThreadViewsRef.current.clear();

    void subAgentStore.list(parentThread.id, sourceId)
      .then((loadedThreads) => {
        if (isCancelled) {
          return;
        }

        const loadedTreeNodes = buildSubAgentThreadTree(
          parentThread,
          loadedThreads,
          sourceId
        );
        const firstLoadedThreadId = findFirstSubAgentThreadId(loadedTreeNodes);
        setSelectedThreadId(resolveInitialSubAgentThreadId(
          initialSelectedThreadId,
          loadedThreads,
          firstLoadedThreadId
        ));
      })
      .catch(() => {
        if (isCancelled) {
          return;
        }

        const cachedThreads = subAgentStore.read(
          parentThread.id,
          sourceId
        );
        const cachedTreeNodes = buildSubAgentThreadTree(
          parentThread,
          cachedThreads,
          sourceId
        );
        setSelectedThreadId(resolveInitialSubAgentThreadId(
          initialSelectedThreadId,
          cachedThreads,
          findFirstSubAgentThreadId(cachedTreeNodes)
        ));
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingList(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [initialSelectedThreadId, open, parentThread.id, sourceId, subAgentStore]);

  useEffect(() => {
    if (!open || selectedThreadId === null) {
      return;
    }

    let isCancelled = false;
    const viewKey = createSourceThreadKey(sourceId, selectedThreadId);
    const cachedView = readonlyThreadViewsRef.current.get(viewKey) ?? null;

    if (cachedView !== null) {
      setThreadView(cachedView);
      setIsLoadingThread(false);
    } else {
      setIsLoadingThread(true);
    }

    if (sourceId !== null) {
      void subAgentStore
        .loadCollaborationEvents(sourceId, selectedThreadId)
        .catch(() => undefined);
    }

    if (cachedView !== null) {
      return;
    }

    void subAgentStore.readThread(selectedThreadId, sourceId)
      .then((nextThreadView) => {
        if (!isCancelled) {
          readonlyThreadViewsRef.current.set(viewKey, nextThreadView);
          setThreadView(nextThreadView);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingThread(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [open, selectedThreadId, sourceId, subAgentStore]);

  function handleSelectThread(threadId: string): void {
    setSelectedThreadId(threadId);
  }

  function handleOpenLink(href: string): void {
    projectStore.openExternalLink(href);
  }

  function handleIgnoredEdit(): void {
    // Readonly sub-agent inspection intentionally disables message editing.
  }

  function handleNavigateThread(threadId: string): void {
    if (threads.some((thread) => thread.id === threadId)) {
      setSelectedThreadId(threadId);
    }
  }

  function handleNavigateRoot(): void {
    projectStore.navigateToThread(sourceId, parentThread.id);
    onClose();
  }

  const content = renderDialogContent(
    t,
    parentThread,
    sourceId,
    threads,
    treeNodes,
    selectedThreadId,
    currentThread,
    turnStores,
    collaborationTimeline.threadEvents,
    collaborationTimeline.eventsByTurnId,
    threads.map((thread) => thread.id),
    isLoadingList,
    isLoadingThread,
    handleSelectThread,
    handleNavigateRoot,
    handleOpenLink,
    handleNavigateThread,
    handleIgnoredEdit
  );

  return (
    <Dialog open={open} fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>{t("sidebar.subAgentThreadsTitle")}</DialogTitle>
      <DialogContent sx={{ p: 0, height: "min(70vh, 640px)", overflow: "hidden" }}>
        {content}
      </DialogContent>
    </Dialog>
  );
}

/** Chooses the requested descendant when available, otherwise the first tree entry. */
export function resolveInitialSubAgentThreadId(
  requestedThreadId: string | null,
  threads: readonly OpenCodexThread[],
  firstThreadId: string | null
): string | null {
  if (
    requestedThreadId !== null
    && threads.some((thread) => thread.id === requestedThreadId)
  ) {
    return requestedThreadId;
  }

  return firstThreadId;
}

export const SubAgentThreadsDialogX = observer(SubAgentThreadsDialog);

/**
 * Renders the dialog body for the current sub-agent loading state.
 *
 * @param t Translation function.
 * @param rootThread Root thread whose hierarchy is displayed.
 * @param sourceId Source that owns the hierarchy.
 * @param threads Sub-agent thread list.
 * @param treeNodes Structural descendant roots.
 * @param selectedThreadId Selected sub-agent thread id.
 * @param currentThread Selected readonly thread metadata.
 * @param turnStores Renderable turn stores.
 * @param threadCollaborationEvents Events not reliably correlated to a receiver turn.
 * @param collaborationEventsByTurnId Events correlated to turns observed in this thread.
 * @param navigableThreadIds Descendants that can be selected without leaving the dialog.
 * @param isLoadingList Whether the sub-agent list is loading.
 * @param isLoadingThread Whether the selected thread is loading.
 * @param onSelectThread Selection callback.
 * @param onNavigateRoot Root navigation callback.
 * @param onOpenLink Link opening callback.
 * @param onNavigateThread Related-thread navigation callback.
 * @param onIgnoredEdit Readonly edit placeholder.
 * @returns Dialog body.
 */
function renderDialogContent(
  t: (key: string) => string,
  rootThread: OpenCodexThread,
  sourceId: string | null,
  threads: OpenCodexThread[],
  treeNodes: readonly SubAgentThreadTreeNode[],
  selectedThreadId: string | null,
  currentThread: OpenCodexThread | null,
  turnStores: ChatTurnStore[],
  threadCollaborationEvents: readonly OpenCodexCollaborationEvent[],
  collaborationEventsByTurnId: ReadonlyMap<string, OpenCodexCollaborationEvent[]>,
  navigableThreadIds: readonly string[],
  isLoadingList: boolean,
  isLoadingThread: boolean,
  onSelectThread: (threadId: string) => void,
  onNavigateRoot: () => void,
  onOpenLink: (href: string) => void,
  onNavigateThread: (threadId: string) => void,
  onIgnoredEdit: () => void
) {
  if (isLoadingList) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (treeNodes.length === 0) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">
          {t("sidebar.subAgentThreadsEmpty")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: "340px minmax(0, 1fr)",
        height: "100%",
        minHeight: 0,
        overflow: "hidden"
      }}
    >
      <Box
        sx={{
          borderRight: 1,
          borderColor: "divider",
          minHeight: 0,
          overflowY: "auto"
        }}
      >
        <SubAgentThreadTree
          rootThread={rootThread}
          nodes={treeNodes}
          selectedThreadId={selectedThreadId}
          onNavigateRoot={onNavigateRoot}
          onSelectThread={onSelectThread}
        />
      </Box>
      <Box sx={{ minWidth: 0, minHeight: 0, overflowY: "auto", p: 2 }}>
        {isLoadingThread ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Stack spacing={1.25}>
            {currentThread !== null ? (
              <>
                <SubAgentThreadHeader
                  rootThread={rootThread}
                  descendants={threads}
                  currentThread={currentThread}
                  sourceId={sourceId}
                  onNavigateRoot={onNavigateRoot}
                  onSelectThread={onSelectThread}
                />
                <CollaborationEventList
                  events={threadCollaborationEvents}
                  currentThread={currentThread}
                  isThreadContext
                  navigableThreadIds={navigableThreadIds}
                  onNavigateThread={onNavigateThread}
                />
              </>
            ) : null}
            {currentThread !== null ? turnStores.map((turnStore, index) => (
              <ChatTurnViewX
                key={turnStore.id}
                turnStore={turnStore}
                activeTurnId={null}
                isWorking={false}
                isLastTurn={index === turnStores.length - 1}
                editableItem={null}
                collaborationEvents={collaborationEventsByTurnId.get(turnStore.id) ?? []}
                navigableThreadIds={navigableThreadIds}
                currentThread={currentThread}
                lastMessageRef={{ current: null }}
                onOpenLink={onOpenLink}
                onNavigateThread={onNavigateThread}
                onStartEdit={onIgnoredEdit}
              />
            )) : null}
            {turnStores.length === 0 ? (
              <>
                <Divider />
                <Typography color="text.secondary">
                  {t("sidebar.subAgentThreadNoMessages")}
                </Typography>
              </>
            ) : null}
          </Stack>
        )}
      </Box>
    </Box>
  );
}
