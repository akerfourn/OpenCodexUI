/**
 * Renders the chat composer component for the OpenCodex UI.
 */
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import { useEffect, useRef, useState } from "react";
import { Button, IconButton, Stack, TextField, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexImageAttachment,
  OpenCodexReasoningEffort
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../stores/ChatStore";
import type { RootStore } from "../../stores/RootStore";
import { ComposerAttachmentList } from "./ComposerAttachmentList";
import { ModelSettingsFields } from "./ModelSettingsFields";

type ChatComposerProps = {
  store: RootStore;
  chatStore: ChatStore;
  selectedModel: string | null;
  reasoningEffort: OpenCodexReasoningEffort;
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
  selectedModel,
  reasoningEffort,
  modelOptions,
  isWorking
}: ChatComposerProps) {
  const { t } = useTranslation();
  const composerFieldRef = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<OpenCodexImageAttachment[]>([]);
  const canSteer = chatStore.canSteerActiveTurn;
  const isSteering = isWorking && canSteer;
  const canSubmit = (draft.trim().length > 0 || attachments.length > 0) && (!isWorking || canSteer);
  const canAttachImages = !isWorking || canSteer;

  useEffect(() => {
    setDraft("");
    setAttachments([]);
  }, [chatStore.thread.id]);

  function handleInput(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setDraft(event.target.value);
    requestAnimationFrame(scrollComposerFieldToBottom);
  }

  async function submitDraft(): Promise<void> {
    if (!canSubmit) {
      return;
    }

    const wasAccepted = await chatStore.sendMessage(draft, attachments);

    if (!wasAccepted) {
      return;
    }

    setDraft("");
    setAttachments([]);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void submitDraft();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!event.ctrlKey || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    void submitDraft();
  }

  function handleModelChange(value: string | null): void {
    store.appStore.setSelectedModel(value);
  }

  function handleEffortChange(value: OpenCodexReasoningEffort): void {
    store.appStore.setReasoningEffort(value);
  }

  function handleInterrupt(): void {
    chatStore.interruptTurn();
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

  function scrollComposerFieldToBottom(): void {
    const composerField = composerFieldRef.current;

    if (composerField === null || composerField.scrollHeight <= composerField.clientHeight) {
      return;
    }

    composerField.scrollTop = composerField.scrollHeight;
  }

  return (
    <form className="composer" onSubmit={handleSubmit} onPaste={handlePaste}>
      <TextField
        ref={composerFieldRef}
        value={draft}
        placeholder={t("composer.messagePlaceholder")}
        multiline
        minRows={4}
        fullWidth
        sx={{
          maxWidth: 820,
          maxHeight: "50vh",
          overflowY: "auto",
          justifySelf: "center",
          "& .MuiInputBase-root": {
            alignItems: "flex-start"
          }
        }}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
      />
      <ComposerAttachmentList
        attachments={attachments}
        onRemoveAttachment={handleRemoveAttachment}
      />
      <Stack className="composer-controls" direction="row" spacing={1}>
        <ModelSettingsFields
          selectedModel={selectedModel}
          reasoningEffort={reasoningEffort}
          modelOptions={modelOptions}
          onModelChange={handleModelChange}
          onReasoningEffortChange={handleEffortChange}
        />
        <div className="spacer" />
        {isWorking ? (
          <Button type="button" variant="outlined" onClick={handleInterrupt}>
            {t("composer.interrupt")}
          </Button>
        ) : null}
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
        <Button variant="contained" type="submit" disabled={!canSubmit}>
          {isSteering ? t("composer.steer") : t("composer.send")}
        </Button>
      </Stack>
    </form>
  );
}

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
