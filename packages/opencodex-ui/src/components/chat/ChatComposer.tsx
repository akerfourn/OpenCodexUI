/**
 * Renders the chat composer component for the OpenCodex UI.
 */
import AddPhotoAlternateOutlinedIcon from "@mui/icons-material/AddPhotoAlternateOutlined";
import { useEffect, useState } from "react";
import { Button, IconButton, MenuItem, Stack, TextField, Tooltip } from "@mui/material";
import { useTranslation } from "react-i18next";

import type {
  OpenCodexImageAttachment,
  OpenCodexReasoningEffort
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "../../stores/ChatStore";
import type { RootStore } from "../../stores/RootStore";
import { ComposerAttachmentList } from "./ComposerAttachmentList";

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
  const [draft, setDraft] = useState("");
  const [attachments, setAttachments] = useState<OpenCodexImageAttachment[]>([]);

  useEffect(() => {
    setDraft("");
    setAttachments([]);
  }, [chatStore.thread.id]);

  function handleInput(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    setDraft(event.target.value);
  }

  function submitDraft(): void {
    if ((draft.trim().length === 0 && attachments.length === 0) || isWorking) {
      return;
    }

    chatStore.sendMessage(draft, attachments);
    setDraft("");
    setAttachments([]);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    submitDraft();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!event.ctrlKey || event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    submitDraft();
  }

  function handleModelChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.appStore.setSelectedModel(event.target.value.length > 0 ? event.target.value : null);
  }

  function handleEffortChange(event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>): void {
    store.appStore.setReasoningEffort(event.target.value as OpenCodexReasoningEffort);
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

  return (
    <form className="composer" onSubmit={handleSubmit} onPaste={handlePaste}>
      <TextField
        value={draft}
        placeholder={t("composer.messagePlaceholder")}
        multiline
        minRows={4}
        fullWidth
        sx={{ maxWidth: 820, justifySelf: "center" }}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
      />
      <ComposerAttachmentList
        attachments={attachments}
        onRemoveAttachment={handleRemoveAttachment}
      />
      <Stack className="composer-controls" direction="row" spacing={1}>
        <TextField
          select
          size="small"
          value={selectedModel ?? ""}
          label={t("composer.model")}
          onChange={handleModelChange}
          sx={{ maxWidth: 220, minWidth: 160 }}
        >
          {modelOptions.map((model) => (
            <MenuItem value={model} key={model}>
              {model}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          select
          size="small"
          value={reasoningEffort}
          label={t("composer.reasoning")}
          onChange={handleEffortChange}
          sx={{ maxWidth: 160, minWidth: 130 }}
        >
          <MenuItem value="low">low</MenuItem>
          <MenuItem value="medium">medium</MenuItem>
          <MenuItem value="high">high</MenuItem>
          <MenuItem value="xhigh">xhigh</MenuItem>
        </TextField>
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
              disabled={isWorking}
              onClick={handleAttachImages}
            >
              <AddPhotoAlternateOutlinedIcon />
            </IconButton>
          </span>
        </Tooltip>
        <Button variant="contained" type="submit" disabled={isWorking}>
          {t("composer.send")}
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
