/**
 * Renders the chat composer component for the OpenCodex UI.
 */
import AssistantDirectionRoundedIcon from "@mui/icons-material/AssistantDirectionRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopCircleRoundedIcon from "@mui/icons-material/StopCircleRounded";
import { useCallback, useState } from "react";
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

import type { ChatStore } from "../../stores/chat/ChatStore";
import type { ChatComposerStore } from "../../stores/chat/ChatComposerStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import type { RootStore } from "../../stores/RootStore";
import { ChatAdvancedActionsMenu } from "./ChatAdvancedActionsMenu";
import { ComposerAttachmentList } from "./ComposerAttachmentList";
import { ComposerPlainTextInput } from "./ComposerPlainTextInput";
import { ModelSettingsFields } from "./ModelSettingsFields";
import { ChatGoalDialogX } from "../dialogs/ChatGoalDialog";

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
  const [isGoalDialogOpen, setIsGoalDialogOpen] = useState(false);
  const composer = chatStore.composer;
  const draft = composer.draft;
  const draftMarkdown = composer.draftMarkdown;
  const draftReferences = composer.draftReferences;
  const attachments = composer.attachments;
  const canSteer = chatStore.actions.canSteerActiveTurn;
  const isSteering = isWorking && canSteer;
  const canSubmit = (draft.trim().length > 0 || attachments.length > 0) && (!isWorking || canSteer);
  const canShowSubmit = !isWorking || canSteer;
  const canAttachImages = !isWorking || canSteer;
  const sourceId = chatStore.sourceId;
  const reasoningEfforts = store.appStore.getReasoningEffortOptions(composer.selectedModel);
  const serviceTierOptions = store.appStore.getServiceTierOptions(composer.selectedModel);
  const areAdvancedActionsDisabled = (
    isWorking ||
    chatStore.runtime.isStartingTurn ||
    chatStore.runtime.isEditingLastTurn ||
    chatStore.runtime.isRecovering ||
    projectStore.isReadOnlyFromCache
  );

  const canOpenFileLinks = canOpenProjectFileLinks(store, sourceId);
  const manageGoalDisabled = chatStore.isReadOnlyFromCache || sourceId === null;

  function handleDraftChange(
    value: string,
    markdown: string,
    references: OpenCodexComposerReference[]
  ): void {
    composer.setDraft(value, markdown, references);
  }

  async function submitDraft(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    const text = draftMarkdown.trim().length > 0 ? draftMarkdown : draft;
    const wasAccepted = await chatStore.actions.send(text, attachments, draftReferences);

    if (!wasAccepted) {
      return;
    }

    composer.clearDraft();
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

    if (
      event.shiftKey ||
      !shouldSubmitOnEnter(store.appStore.settingsStore.settings.enterKeyBehavior, draft)
    ) {
      return;
    }

    event.preventDefault();
    void submitDraft();
  }

  function handleModelChange(value: string | null): void {
    composer.setModel(value);
  }

  function handleEffortChange(value: ChatComposerStore["reasoningEffort"]): void {
    composer.setReasoningEffort(value);
  }

  function handleServiceTierChange(value: ChatComposerStore["selectedServiceTier"]): void {
    composer.setServiceTier(value);
  }

  function handleInterrupt(): void {
    chatStore.actions.interrupt();
  }

  function handleReview(): void {
    chatStore.actions.review();
  }

  function handleCompact(): void {
    chatStore.actions.compact();
  }

  function handleManageGoal(): void {
    setIsGoalDialogOpen(true);
  }

  function handleGoalDialogClose(): void {
    setIsGoalDialogOpen(false);
  }

  async function handleAttachImages(): Promise<void> {
    const pickedAttachments = await store.pickImageAttachments();

    if (pickedAttachments.length === 0) {
      return;
    }

    composer.addAttachments(pickedAttachments);
  }

  function handleRemoveAttachment(attachmentId: string): void {
    composer.removeAttachment(attachmentId);
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
      composer.addAttachments(pastedAttachments);
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
        resizeLabel={t("composer.resize")}
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
          selectedModel={composer.selectedModel}
          reasoningEffort={composer.reasoningEffort}
          reasoningEfforts={reasoningEfforts}
          selectedServiceTier={composer.selectedServiceTier}
          modelOptions={modelOptions}
          serviceTierOptions={serviceTierOptions}
          onModelChange={handleModelChange}
          onReasoningEffortChange={handleEffortChange}
          onServiceTierChange={handleServiceTierChange}
        />
        <div className="spacer" />
        <ChatAdvancedActionsMenu
          disabled={areAdvancedActionsDisabled}
          attachImagesDisabled={!canAttachImages}
          manageGoalDisabled={manageGoalDisabled}
          onReview={handleReview}
          onCompact={handleCompact}
          onManageGoal={handleManageGoal}
          onAttachImages={() => {
            void handleAttachImages();
          }}
        />
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
      <ChatGoalDialogX
        open={isGoalDialogOpen}
        chatStore={chatStore}
        canOpenFileLinks={canOpenFileLinks}
        onSearchFiles={searchProjectFiles}
        onSearchSkills={searchProjectSkills}
        onOpenFileLink={handleOpenFileLink}
        onClose={handleGoalDialogClose}
      />
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

  return source !== undefined &&
    store.sourcesStore.hasLocalAccess(source.id) &&
    "openFileCommand" in source.settings &&
    source.settings.openFileCommand !== null;
}
