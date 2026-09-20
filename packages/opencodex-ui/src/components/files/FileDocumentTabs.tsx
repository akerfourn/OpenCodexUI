import { observer } from "mobx-react-lite";
import { Box, IconButton, Tab, Tabs, Tooltip } from "@mui/material";
import Close from "@mui/icons-material/Close";
import ChatBubbleOutlineOutlined from "@mui/icons-material/ChatBubbleOutlineOutlined";
import { useTranslation } from "react-i18next";
import type { ProjectFilesStore } from "../../stores/files/ProjectFilesStore";

/** Persistent navigation between chat and retained file buffers. */
export function FileDocumentTabs({ files }: { files: ProjectFilesStore }) {
  const { t } = useTranslation();
  const documents = Array.from(files.documents.values());
  if (documents.length === 0) return null;
  /** Switches central content without closing the other view. */
  function change(_event: React.SyntheticEvent, id: string): void {
    if (id === "chat") files.showChat();
    else files.show(id);
  }
  const selectedTab = files.isVisible ? files.activeId : "chat";
  const tabs = documents.map((document) => {
    const fileLabel = document.name + (document.isDirty ? " •" : "");
    const title = `${document.workspaceName} · ${document.target?.workspacePath ?? ""}\n${document.target?.path ?? document.name}`;
    const label = (
      <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Tooltip title={title}>
          <span>{fileLabel}</span>
        </Tooltip>
        <IconButton
          component="span"
          role="button"
          tabIndex={0}
          size="small"
          aria-label={t("files.close", { name: document.name })}
          onClick={(event) => {
            event.stopPropagation();
            files.close(document);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              files.close(document);
            }
          }}
        >
          <Close sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>
    );
    return (
      <Tab
        key={document.id}
        value={document.id}
        label={label}
        sx={{ minHeight: 40, textTransform: "none", minWidth: 80 }}
      />
    );
  });
  return (
    <Tabs
      value={selectedTab}
      onChange={change}
      variant="scrollable"
      scrollButtons="auto"
      aria-label={t("files.documents")}
      sx={{ minHeight: 40, borderBottom: 1, borderColor: "divider", flexShrink: 0 }}
    >
      <Tab
        value="chat"
        icon={<ChatBubbleOutlineOutlined fontSize="small" />}
        aria-label={t("files.chat")}
        sx={{ minHeight: 40, minWidth: 48 }}
      />
      {tabs}
    </Tabs>
  );
}
export const FileDocumentTabsX = observer(FileDocumentTabs);
