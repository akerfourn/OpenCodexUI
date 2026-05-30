/**
 * Renders the chat composer component for the OpenCodex UI.
 */
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import AssistantDirectionRoundedIcon from "@mui/icons-material/AssistantDirectionRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopCircleRoundedIcon from "@mui/icons-material/StopCircleRounded";
import { useCallback, useEffect, useState } from "react";
import { IconButton, Stack, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexComposerReference,
  OpenCodexEnterKeyBehavior,
  OpenCodexFileSearchResult,
  OpenCodexImageAttachment,
  OpenCodexSkillSearchResult
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../stores/ChatStore";
import type { ProjectStore } from "../../stores/ProjectStore";
import type { RootStore } from "../../stores/RootStore";
import { ChatAdvancedActionsMenu } from "./ChatAdvancedActionsMenu";
import { ComposerAttachmentList } from "./ComposerAttachmentList";
import { ComposerPlainTextInput } from "./ComposerPlainTextInput";
import { ModelSettingsFields } from "./ModelSettingsFields";

type ChatComposerProps = {
  store: RootStore;
  chatStore: ChatStore;
  projectStore: ProjectStore;
  modelOptions: string[];
  isWorking: boolean;
};

/**
 * Renders the chat composer component.
 *
 * @param props Component props.
 *
 * @returns Nothing.
 */
export function ChatComposer({
  store,
  chatStore,
  projectStore,
  modelOptions,
  isWorking
}: ChatComposerProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const [draftMarkdown, setDraftMarkdown] = useState("");
  const [draftReferences, setDraftReferences] = useState<OpenCodexComposerReference[]>([]);
  const [attachments, setAttachments] = useState<OpenCodexImageAttachment[]>([]);
  const canSteer = chatStore.canSteerActiveTurn;
  const isSteering = isWorking && canSteer;
  const canSubmit = (draft.trim().length > 0 || attachments.length > 0) && (!isWorking || canSteer);
  const canShowSubmit = !isWorking || canSteer;
  const canAttachImages = !isWorking || canSteer;
  const sourceId = chatStore.sourceId;
  const areAdvancedActionsDisabled = (
    isWorking ||
    chatStore.isStartingTurn ||
    chatStore.isEditingLastTurn ||
    chatStore.isRecovering ||
    projectStore.isOrphan
  );

  useEffect(() => {
    setDraft("");
    setDraftMarkdown("");
    setDraftReferences([]);
    setAttachments([]);
  }, [chatStore.thread.id]);

  const canOpenFileLinks = canOpenProjectFileLinks(store, sourceId);

  function handleDraftChange(
    value: string,
    markdown: string,
    references: OpenCodexComposerReference[]
  ): void {
    setDraft(value);
    setDraftMarkdown(markdown);
    setDraftReferences(references);
  }

  async function submitDraft(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    const text = draftMarkdown.trim().length > 0 ? draftMarkdown : draft;
    const wasAccepted = await chatStore.sendMessage(text, attachments, draftReferences);

    if (!wasAccepted) {
      return;
    }

    setDraft("");
    setDraftMarkdown("");
    setDraftReferences([]);
    setAttachments([]);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submitDraft();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "Enter") {
      return;
    }

    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.ctrlKey) {
      event.preventDefault();
      void submitDraft();
      return;
    }

    if (event.shiftKey || !shouldSubmitOnEnter(store.appStore.settings.enterKeyBehavior, draft)) {
      return;
    }

    event.preventDefault();
    void submitDraft();
  }

  function handleModelChange(value: string | null): void {
    chatStore.setSelectedModel(value);
  }

  function handleEffortChange(value: ChatStore["reasoningEffort"]): void {
    chatStore.setReasoningEffort(value);
  }

  function handleInterrupt(): void {
    chatStore.interruptTurn();
  }

  function handleReview(): void {
    chatStore.startReview();
  }

  function handleCompact(): void {
    chatStore.compactThread();
  }

  async function handleAttachImages(): Promise<void> {
    const pickedAttachments = await store.pickImageAttachments();

    if (pickedAttachments.length === 0) {
      return;
    }

    setAttachments((current) => [...current, ...pickedAttachments]);
  }

  function handleRemoveAttachment(attachmentId: string): void {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  const searchProjectFiles = useCallback(async (
    query: string
  ): Promise<OpenCodexFileSearchResult[]> => {
    return await store.request<OpenCodexFileSearchResult[]>({
      type: "files.search",
      projectPath: projectStore.projectPath,
      sourceId,
      query,
      limit: 8
    });
  }, [projectStore.projectPath, sourceId, store]);

  const searchProjectSkills = useCallback(async (
    query: string
  ): Promise<OpenCodexSkillSearchResult[]> => {
    return await store.request<OpenCodexSkillSearchResult[]>({
      type: "skills.search",
      projectPath: projectStore.projectPath,
      sourceId,
      query,
      limit: 8
    });
  }, [projectStore.projectPath, sourceId, store]);

  const handleOpenFileLink = useCallback((href: string): void => {
    if (!canOpenFileLinks) {
      return;
    }

    store.openExternalLink(href);
  }, [canOpenFileLinks, store]);

  function handlePaste(event: React.ClipboardEvent<HTMLFormElement>): void {
    const items = Array.from(event.clipboardData.items);
    const imageFiles = items
      .filter((item) => item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length === 0) {
      return;
    }

    event.preventDefault();
    void addImageFiles(imageFiles);
  }

  async function addImageFiles(imageFiles: File[]): Promise<void> {
    try {
      const pastedAttachments = await Promise.all(imageFiles.map(readImageAttachmentFromFile));
      setAttachments((current) => [...current, ...pastedAttachments]);
    } catch {
      // Ignore unreadable clipboard files and leave the composer unchanged.
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit} onPaste={handlePaste}>
      <ComposerPlainTextInput
        value={draft}
        placeholder={t("composer.messagePlaceholder")}
        canOpenFileLinks={canOpenFileLinks}
        onChange={handleDraftChange}
        onSearchFiles={searchProjectFiles}
        onSearchSkills={searchProjectSkills}
        onOpenFileLink={handleOpenFileLink}
        onKeyDown={handleKeyDown}
      />
      <ComposerAttachmentList
        attachments={attachments}
        onRemoveAttachment={handleRemoveAttachment}
      />
      <Stack className="composer-controls" direction="row" spacing={1}>
        <ModelSettingsFields
          selectedModel={chatStore.selectedModel}
          reasoningEffort={chatStore.reasoningEffort}
          modelOptions={modelOptions}
          onModelChange={handleModelChange}
          onReasoningEffortChange={handleEffortChange}
        />
        <div className="spacer" />
        <ChatAdvancedActionsMenu
          disabled={areAdvancedActionsDisabled}
          onReview={handleReview}
          onCompact={handleCompact}
        />
        <Tooltip title={t("composer.attachImage")}>
          <span>
            <IconButton
              type="button"
              aria-label={t("composer.attachImage")}
              disabled={!canAttachImages}
              onClick={handleAttachImages}
            >
              <AddPhotoAlternateOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        {isWorking ? (
          <Tooltip title={t("composer.interrupt")}>
            <span>
              <IconButton
                className="composer-icon-button composer-icon-button-stop"
                type="button"
                aria-label={t("composer.interrupt")}
                onClick={handleInterrupt}
              >
                <StopCircleRoundedIcon />
              </IconButton>
            </span>
          </Tooltip>
        ) : null}
        {canShowSubmit ? (
          <Tooltip title={isSteering ? t("composer.steer") : t("composer.send")}>
            <span>
              <IconButton
                className="composer-icon-button composer-icon-button-primary"
                type="submit"
                aria-label={isSteering ? t("composer.steer") : t("composer.send")}
                disabled={!canSubmit}
              >
                {isSteering ? <AssistantDirectionRoundedIcon /> : <SendRoundedIcon />}
              </IconButton>
            </span>
          </Tooltip>
        ) : null}
      </Stack>
    </form>
  );
}

export const ChatComposerX = observer(ChatComposer);

function readImageAttachmentFromFile(file: File): Promise<OpenCodexImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read pasted image."));
        return;
      }

      resolve({
        id: createAttachmentId(),
        kind: "image",
        source: "dataUrl",
        value: reader.result,
        name: file.name.length > 0 ? file.name : "pasted-image.png"
      });
    });

    reader.addEventListener("error", () => {
      reject(reader.error ?? new Error("Unable to read pasted image."));
    });

    reader.readAsDataURL(file);
  });
}

function createAttachmentId(): string {
  return `attachment-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function shouldSubmitOnEnter(
  enterKeyBehavior: OpenCodexEnterKeyBehavior,
  draft: string
): boolean {
  if (enterKeyBehavior === "send") {
    return true;
  }

  if (enterKeyBehavior === "smart") {
    return !draft.includes("\n");
  }

  return false;
}

function canOpenProjectFileLinks(store: RootStore, sourceId: string | null): boolean {
  if (sourceId === null) {
    return false;
  }

  const source = store.sourcesStore.sources.find((entry) => entry.id === sourceId);

  return source?.settings.openFileCommand !== null && source?.settings.openFileCommand !== undefined;
}
