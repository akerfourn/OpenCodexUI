/**
 * Renders a readonly dialog for sub-agent threads spawned by a parent chat.
 */
import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Box,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Divider,
  List,
  ListItemButton,
  Stack,
  Typography
} from "@mui/material";
import { useTranslation } from "react-i18next";

import type { OpenCodexThread, OpenCodexTurn } from "@open-codex-ui/opencodex-protocol";

import type { ProjectStore } from "../../stores/ProjectStore";
import { ChatTurnStore } from "../../stores/ChatTurnStore";
import { ChatTurnViewX } from "../messages/ChatTurnView";

type SubAgentThreadsDialogProps = {
  open: boolean;
  parentThread: OpenCodexThread;
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
  projectStore,
  onClose
}: SubAgentThreadsDialogProps) {
  const { t } = useTranslation();
  const threadListStore = projectStore.threadListStore;
  const [threads, setThreads] = useState<OpenCodexThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadView, setThreadView] = useState<ReadonlyThreadView | null>(null);
  const [isLoadingList, setIsLoadingList] = useState(false);
  const [isLoadingThread, setIsLoadingThread] = useState(false);
  const turnStores = useMemo(() => (
    threadView?.turns.map((turn) => new ChatTurnStore(turn)) ?? []
  ), [threadView?.turns]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let isCancelled = false;
    setIsLoadingList(true);
    setThreadView(null);
    setSelectedThreadId(null);

    void threadListStore.listSubAgentThreads(parentThread.id)
      .then((subAgentThreads) => {
        if (isCancelled) {
          return;
        }

        setThreads(subAgentThreads);
        setSelectedThreadId(subAgentThreads[0]?.id ?? null);
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingList(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [open, parentThread.id, threadListStore]);

  useEffect(() => {
    if (!open || selectedThreadId === null) {
      return;
    }

    let isCancelled = false;
    setIsLoadingThread(true);

    void threadListStore.readThreadReadonly(selectedThreadId)
      .then((nextThreadView) => {
        if (!isCancelled) {
          setThreadView(nextThreadView);
        }
      })
      .finally(() => {
        if (!isCancelled) {
          setIsLoadingThread(false);
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [open, selectedThreadId, threadListStore]);

  function handleSelectThread(threadId: string): void {
    setSelectedThreadId(threadId);
  }

  function handleOpenLink(href: string): void {
    projectStore.openExternalLink(href);
  }

  function handleIgnoredEdit(): void {
    // Readonly sub-agent inspection intentionally disables message editing.
  }

  const content = renderDialogContent(
    t,
    threads,
    selectedThreadId,
    turnStores,
    isLoadingList,
    isLoadingThread,
    handleSelectThread,
    handleOpenLink,
    handleIgnoredEdit
  );

  return (
    <Dialog open={open} fullWidth maxWidth="lg" onClose={onClose}>
      <DialogTitle>{t("sidebar.subAgentThreadsTitle")}</DialogTitle>
      <DialogContent sx={{ p: 0 }}>
        {content}
      </DialogContent>
    </Dialog>
  );
}

export const SubAgentThreadsDialogX = observer(SubAgentThreadsDialog);

/**
 * Renders the dialog body for the current sub-agent loading state.
 *
 * @param t Translation function.
 * @param threads Sub-agent thread list.
 * @param selectedThreadId Selected sub-agent thread id.
 * @param turnStores Renderable turn stores.
 * @param isLoadingList Whether the sub-agent list is loading.
 * @param isLoadingThread Whether the selected thread is loading.
 * @param onSelectThread Selection callback.
 * @param onOpenLink Link opening callback.
 * @param onIgnoredEdit Readonly edit placeholder.
 * @returns Dialog body.
 */
function renderDialogContent(
  t: (key: string) => string,
  threads: OpenCodexThread[],
  selectedThreadId: string | null,
  turnStores: ChatTurnStore[],
  isLoadingList: boolean,
  isLoadingThread: boolean,
  onSelectThread: (threadId: string) => void,
  onOpenLink: (href: string) => void,
  onIgnoredEdit: () => void
) {
  if (isLoadingList) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (threads.length === 0) {
    return (
      <Box sx={{ p: 4 }}>
        <Typography color="text.secondary">
          {t("sidebar.subAgentThreadsEmpty")}
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "280px minmax(0, 1fr)", minHeight: 520 }}>
      <List dense sx={{ borderRight: 1, borderColor: "divider", overflowY: "auto" }}>
        {threads.map((thread) => (
          <ListItemButton
            key={thread.id}
            selected={thread.id === selectedThreadId}
            onClick={() => onSelectThread(thread.id)}
          >
            <Stack sx={{ minWidth: 0 }}>
              <Typography variant="body2" noWrap>
                {thread.agentNickname ?? thread.title}
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                {thread.agentRole ?? thread.preview}
              </Typography>
            </Stack>
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ minWidth: 0, overflowY: "auto", p: 2 }}>
        {isLoadingThread ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Stack spacing={1.25}>
            {turnStores.map((turnStore, index) => (
              <ChatTurnViewX
                key={turnStore.id}
                turnStore={turnStore}
                activeTurnId={null}
                isWorking={false}
                isLastTurn={index === turnStores.length - 1}
                editableItem={null}
                lastMessageRef={{ current: null }}
                onOpenLink={onOpenLink}
                onStartEdit={onIgnoredEdit}
                onContentLayoutChange={onIgnoredEdit}
              />
            ))}
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
