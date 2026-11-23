import ChatBubbleOutlineOutlinedIcon from "@mui/icons-material/ChatBubbleOutlineOutlined";
import { Stack, Typography } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { RootStore } from "../../stores/RootStore";
import { ResizableSidebarLayout } from "../layout/ResizableSidebarLayout";
import { ProjectViewX } from "../projects/ProjectView";
import { DiscussionsSidebarX } from "./DiscussionsSidebar";
import { SubAgentThreadsDialogX } from "../threads/SubAgentThreadsDialog";
import type { OpenSubAgentDialog, SubAgentDialogRequest } from "../threads/subAgentDialog";

/** Hosts the shared chat and file viewers behind the fixed icon-only application tab. */
export function DiscussionsView({ store }: { store: RootStore }) {
  const { t } = useTranslation();
  const discussions = store.discussionsStore;
  const [subAgents, setSubAgents] = useState<SubAgentDialogRequest | null>(null);
  useEffect(() => { void discussions.load(); }, [discussions]);

  /** Opens descendants from a row without requiring its parent to be selected first. */
  const handleOpenSubAgents: OpenSubAgentDialog = (rootThread, selectedThreadId = null) => {
    setSubAgents({ rootThread, selectedThreadId });
  };

  if (discussions.selected !== null) {
    return <ProjectViewX store={store} projectStore={discussions.selected} />;
  }

  const owner = subAgents === null ? null
    : store.projectsStore.findProjectStoreForThread(subAgents.rootThread.id, subAgents.rootThread.sourceId);
  const dialog = subAgents === null || owner === null ? null : (
    <SubAgentThreadsDialogX open parentThread={subAgents.rootThread}
      initialSelectedThreadId={subAgents.selectedThreadId} projectStore={owner} onClose={handleCloseSubAgents} />
  );

  /** Releases the read-only descendant view when its modal closes. */
  function handleCloseSubAgents(): void { setSubAgents(null); }

  return (
    <>
    <ResizableSidebarLayout className="workspace-shell" defaultSidebarWidth={320}
      sidebar={<DiscussionsSidebarX store={store} onOpenSubAgentDialog={handleOpenSubAgents} />}>
      <Stack sx={{ flex: 1, alignItems: "center", justifyContent: "center", p: 3, gap: 1 }}>
        <ChatBubbleOutlineOutlinedIcon color="action" sx={{ fontSize: 40 }} />
        <Typography variant="h6">{t("discussions.title")}</Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 480, textAlign: "center" }}>{t("discussions.description")}</Typography>
      </Stack>
    </ResizableSidebarLayout>
    {dialog}
    </>
  );
}

export const DiscussionsViewX = observer(DiscussionsView);
