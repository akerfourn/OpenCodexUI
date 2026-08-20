/**
 * Holds the model settings and draft state for one chat composer.
 */
import { makeAutoObservable } from "mobx";

import type {
  OpenCodexComposerReference,
  OpenCodexImageAttachment,
  OpenCodexReasoningEffort,
  OpenCodexServiceTier,
  OpenCodexThread
} from "@open-codex-ui/opencodex-protocol";

import type { ChatStore } from "./ChatStore";

/**
 * Stores the editable input and model choices for a chat.
 */
export class ChatComposerStore {
  /** Model selected for future turns in this chat. */
  selectedModel: string | null = null;
  /** Reasoning effort selected for future turns in this chat. */
  reasoningEffort: OpenCodexReasoningEffort = "medium";
  /** Optional service tier selected for future turns in this chat. */
  selectedServiceTier: OpenCodexServiceTier | null = null;
  /** Plain-text draft preserved per chat. */
  draft = "";
  /** Markdown draft with references serialized. */
  draftMarkdown = "";
  /** Structured references embedded in the markdown draft. */
  draftReferences: OpenCodexComposerReference[] = [];
  /** Image attachments currently staged in the draft. */
  attachments: OpenCodexImageAttachment[] = [];
  /** Whether the user explicitly changed the model for this chat. */
  private hasExplicitModelSelection = false;
  /** Whether the user explicitly changed reasoning effort for this chat. */
  private hasExplicitReasoningEffortSelection = false;

  /**
   * Creates the composer attached to its owning chat.
   *
   * @param parent Owning chat used for dynamic thread and application context.
   */
  constructor(private readonly parent: ChatStore) {
    this.selectedModel = resolveInitialSelectedModel(parent.thread, parent);
    this.reasoningEffort = resolveInitialReasoningEffort(parent.thread, parent);
    makeAutoObservable<
      ChatComposerStore,
      "parent" | "hasExplicitModelSelection" | "hasExplicitReasoningEffortSelection"
    >(
      this,
      {
        parent: false,
        hasExplicitModelSelection: false,
        hasExplicitReasoningEffortSelection: false
      },
      { autoBind: true }
    );
  }

  /**
   * Updates the model used by this chat for future turns.
   *
   * @param value Model identifier, or `null` for the backend default.
   */
  setModel(value: string | null): void {
    this.selectedModel = value;
    this.selectedServiceTier = resolveAvailableServiceTier(
      value,
      this.selectedServiceTier,
      this.parent
    );
    this.reasoningEffort = this.parent.appStore.resolveReasoningEffort(
      value,
      this.reasoningEffort
    );
    this.hasExplicitModelSelection = true;
    this.parent.applyComposerThreadMetadata(value, this.reasoningEffort);
  }

  /**
   * Updates the reasoning effort used by this chat for future turns.
   *
   * @param value Reasoning effort to use for future turns.
   */
  setReasoningEffort(value: OpenCodexReasoningEffort): void {
    this.reasoningEffort = value;
    this.hasExplicitReasoningEffortSelection = true;
    this.parent.applyComposerThreadMetadata(this.selectedModel, value);
  }

  /**
   * Reconciles the current effort after a model catalog refresh.
   */
  reconcileReasoningEffort(): void {
    const nextReasoningEffort = this.parent.appStore.resolveReasoningEffort(
      this.selectedModel,
      this.reasoningEffort
    );

    if (nextReasoningEffort === this.reasoningEffort) {
      return;
    }

    this.reasoningEffort = nextReasoningEffort;
    this.parent.applyComposerThreadMetadata(this.selectedModel, nextReasoningEffort);
  }

  /**
   * Updates the service tier used by this chat for future turns.
   *
   * @param value Service tier identifier, or `null` for the Codex default.
   */
  setServiceTier(value: OpenCodexServiceTier | null): void {
    this.selectedServiceTier = resolveAvailableServiceTier(
      this.selectedModel,
      value,
      this.parent
    );
  }

  /**
   * Applies thread-provided model settings until the user explicitly overrides them.
   */
  applyThreadMetadata(): void {
    if (!this.hasExplicitModelSelection && this.parent.thread.model !== null) {
      this.selectedModel = this.parent.thread.model;
    }

    if (
      !this.hasExplicitReasoningEffortSelection &&
      this.parent.thread.reasoningEffort !== null
    ) {
      this.reasoningEffort = this.parent.thread.reasoningEffort;
    }
  }

  /**
   * Updates the in-memory draft and clones references for observable isolation.
   *
   * @param value Plain-text draft.
   * @param markdown Markdown serialization including references.
   * @param references References embedded in the markdown draft.
   */
  setDraft(
    value: string,
    markdown: string,
    references: OpenCodexComposerReference[]
  ): void {
    this.draft = value;
    this.draftMarkdown = markdown;
    this.draftReferences = cloneComposerReferences(references);
  }

  /**
   * Appends image attachments to the in-memory draft.
   *
   * @param attachments Image attachments to add.
   */
  addAttachments(attachments: OpenCodexImageAttachment[]): void {
    this.attachments = [
      ...this.attachments,
      ...cloneImageAttachments(attachments)
    ];
  }

  /**
   * Removes one image attachment from the in-memory draft.
   *
   * @param attachmentId Attachment identifier.
   */
  removeAttachment(attachmentId: string): void {
    this.attachments = this.attachments.filter((attachment) => {
      return attachment.id !== attachmentId;
    });
  }

  /**
   * Clears the in-memory draft after a successful send.
   */
  clearDraft(): void {
    this.draft = "";
    this.draftMarkdown = "";
    this.draftReferences = [];
    this.attachments = [];
  }
}

/**
 * Clones composer references before crossing request boundaries.
 *
 * @param references Composer references.
 * @returns Plain cloned references.
 */
export function cloneComposerReferences(
  references: OpenCodexComposerReference[]
): OpenCodexComposerReference[] {
  return references.map((reference) => ({
    type: reference.type,
    name: reference.name,
    path: reference.path
  }));
}

/**
 * Clones image attachments before crossing request boundaries.
 *
 * @param attachments Image attachments.
 * @returns Plain cloned attachments.
 */
export function cloneImageAttachments(
  attachments: OpenCodexImageAttachment[]
): OpenCodexImageAttachment[] {
  return attachments.map((attachment) => ({
    id: attachment.id,
    kind: attachment.kind,
    source: attachment.source,
    value: attachment.value,
    name: attachment.name ?? null,
    previewUrl: attachment.previewUrl ?? null
  }));
}

/**
 * Resolves the initial model for a chat composer.
 *
 * @param thread Thread metadata.
 * @param parent Owning chat with application model settings.
 * @returns Model identifier, or `null`.
 */
function resolveInitialSelectedModel(thread: OpenCodexThread, parent: ChatStore): string | null {
  if (thread.model !== null) {
    return thread.model;
  }

  return parent.appStore.models[0]?.model
    ?? parent.appStore.selectedModel
    ?? parent.appStore.settingsStore.settings.defaultModel;
}

/**
 * Resolves the initial reasoning effort for a chat composer.
 *
 * @param thread Thread metadata.
 * @param parent Owning chat with application model settings.
 * @returns Reasoning effort.
 */
function resolveInitialReasoningEffort(
  thread: OpenCodexThread,
  parent: ChatStore
): OpenCodexReasoningEffort {
  const selectedModel = resolveInitialSelectedModel(thread, parent);
  const configuredEffort = thread.reasoningEffort
    ?? parent.appStore.settingsStore.settings.defaultReasoningEffort
    ?? "medium";
  return parent.appStore.resolveReasoningEffort(selectedModel, configuredEffort);
}

/**
 * Keeps a selected service tier only when available for the selected model.
 *
 * @param model Model identifier.
 * @param serviceTier Selected service tier.
 * @param parent Owning chat with application model settings.
 * @returns Available service tier, or `null`.
 */
function resolveAvailableServiceTier(
  model: string | null,
  serviceTier: OpenCodexServiceTier | null,
  parent: ChatStore
): OpenCodexServiceTier | null {
  if (serviceTier === null) {
    return null;
  }

  const tiers = parent.appStore.getServiceTierOptions(model);
  const isAvailable = tiers.some((tier) => tier.id === serviceTier);

  return isAvailable ? serviceTier : null;
}
