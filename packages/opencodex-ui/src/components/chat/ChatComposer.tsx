import { readClipboardAttachments, readClipboardFiles } from "./clipboardAttachments";
/**
 * Renders the chat composer component for the OpenCodex UI.
 */
import AssistantDirectionRoundedIcon from "@mui/icons-material/AssistantDirectionRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import StopCircleRoundedIcon from "@mui/icons-material/StopCircleRounded";
import { useCallback, useRef } from "react";
import { IconButton, Stack, Tooltip } from "@mui/material";
import { observer } from "mobx-react-lite";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexComposerReference,
  OpenCodexEnterKeyBehavior,
  OpenCodexFileSearchMode,
  OpenCodexFileSearchResult,
  OpenCodexSkillSearchResult
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../stores/chat/ChatStore";
import type { ChatComposerStore } from "../../stores/chat/ChatComposerStore";
import type { ProjectStore } from "../../stores/project/ProjectStore";
import type { RootStore } from "../../stores/RootStore";
import { ChatAdvancedActionsMenu } from "./ChatAdvancedActionsMenu";
import { ComposerAttachmentListX } from "./ComposerAttachmentList";
import { ComposerEmojiPicker } from "./ComposerEmojiPicker";
import {
  ComposerPlainTextInput,
  type ComposerPlainTextInputHandle
} from "./ComposerPlainTextInput";
import { ModelSettingsFields } from "./ModelSettingsFields";
import { canOpenProjectFileLinks } from "./projectFileLinkAccess";

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
  const composer = chatStore.composer;
  const composerInputRef = useRef<ComposerPlainTextInputHandle>(null);
  const draft = composer.draft;
  const draftMarkdown = composer.draftMarkdown;
  const draftReferences = composer.draftReferences;
  const attachments = composer.attachments;
  const canSteer = chatStore.actions.canSteerActiveTurn;
  const isSteering = isWorking && canSteer;
  const canSubmit = (draft.trim().length > 0 || attachments.length > 0) && (!isWorking || canSteer);
  const canShowSubmit = !isWorking || canSteer;
  const canAttachFiles = !isWorking || canSteer;
  const sourceId = chatStore.sourceId;
  const emojiOverrides = store.emojiCatalogStore.overrides;
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

  function handleDraftChange(
    value: string,
    markdown: string,
    references: OpenCodexComposerReference[]
  ): void {
    composer.setDraft(value, markdown, references);
  }

  function handleEmojiSelect(emoji: string): void {
    composerInputRef.current?.insertText(emoji);
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

  async function handleAttachFiles(): Promise<void> {
    try {
      const pickedAttachments = await store.pickFileAttachments();
      composer.addAttachments(pickedAttachments);
    } catch (error) {
      store.appStore.applyError({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  function handleRemoveAttachment(attachmentId: string): void {
    composer.removeAttachment(attachmentId);
  }

  const searchProjectFiles = useCallback(async (
    query: string,
    searchMode: OpenCodexFileSearchMode
  ): Promise<OpenCodexFileSearchResult[]> => {
    return await store.request<OpenCodexFileSearchResult[]>({
      type: "files.search",
      projectPath: projectStore.workspacePath,
      sourceId,
      query,
      limit: 8,
      searchMode
    });
  }, [projectStore.workspacePath, sourceId, store]);

  const searchProjectSkills = useCallback(async (
    query: string
  ): Promise<OpenCodexSkillSearchResult[]> => {
    return await store.request<OpenCodexSkillSearchResult[]>({
      type: "skills.search",
      projectPath: projectStore.workspacePath,
      sourceId,
      query,
      limit: 8
    });
  }, [projectStore.workspacePath, sourceId, store]);

  const handleOpenFileLink = useCallback((href: string): void => {
    if (!canOpenFileLinks) {
      return;
    }

    store.openExternalLink(href);
  }, [canOpenFileLinks, store]);

  function handlePaste(event: React.ClipboardEvent<HTMLFormElement>): void {
    const files = readClipboardFiles(event.clipboardData);
    if (files.length === 0) {
      return;
    }
    event.preventDefault();
    // Lexical must not also insert the file's text representation into the draft.
    event.stopPropagation();
    if (!canAttachFiles) {
      return;
    }
    void addClipboardFiles(files);
  }

  /** Reads the selection atomically so a failed paste leaves existing attachments intact. */
  async function addClipboardFiles(files: File[]): Promise<void> {
    try {
      composer.addAttachments(await readClipboardAttachments(files));
    } catch (error) {
      store.appStore.applyError({ type: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <form className="composer" onSubmit={handleSubmit} onPasteCapture={handlePaste}>
      <ComposerPlainTextInput
        ref={composerInputRef}
        value={draft}
        placeholder={t("composer.messagePlaceholder")}
        canOpenFileLinks={canOpenFileLinks}
        resizeLabel={t("composer.resize")}
        enableEmojiSuggestions
        emojiOverrides={emojiOverrides}
        onChange={handleDraftChange}
        onSearchFiles={searchProjectFiles}
        onSearchSkills={searchProjectSkills}
        onOpenFileLink={handleOpenFileLink}
        onKeyDown={handleKeyDown}
      />
      <ComposerAttachmentListX
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
          attachFilesDisabled={!canAttachFiles}
          onReview={handleReview}
          onCompact={handleCompact}
          onAttachFiles={() => {
            void handleAttachFiles();
          }}
        />
        <ComposerEmojiPicker onSelect={handleEmojiSelect} />
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
