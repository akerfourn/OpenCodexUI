import { makeAutoObservable, runInAction } from "mobx";
import type { FileDocument } from "./FileDocument";

/** One global save/discard/cancel flow for documents, projects and app shutdown. */
export class FileCloseStore {
  /** Documents protected by the current request. */
  documents: FileDocument[] = [];
  /** Keeps the confirmation modal locked while saving. */
  isSaving = false;
  /** Continuation invoked only after successful saves or explicit discard. */
  private continuation: (() => void) | null = null;
  /** Allows native close requests to clear their pending state on cancellation. */
  private cancellation: (() => void) | null = null;

  /** Keeps functions outside observable state. */
  constructor() {
    makeAutoObservable<this, "continuation" | "cancellation">(this, {
      continuation: false,
      cancellation: false
    });
  }

  /** Protects all dirty or still-saving documents before continuing the action. */
  request(documents: FileDocument[], proceed: () => void, cancel?: () => void): void {
    if (this.documents.length > 0) {
      cancel?.();
      return;
    }
    const pending = documents.filter((document) => document.isDirty || document.isSaving);
    if (pending.length === 0) {
      proceed();
      return;
    }
    this.documents = pending;
    this.continuation = proceed;
    this.cancellation = cancel ?? null;
  }

  /** Aborts the action and retains all editable buffers. */
  cancel(): void {
    if (this.isSaving) return;
    const callback = this.cancellation;
    this.reset();
    callback?.();
  }

  /** Explicitly accepts loss only when no write remains in flight. */
  discard(): void {
    if (this.isSaving || this.documents.some((document) => document.isSaving)) return;
    const callback = this.continuation;
    this.reset();
    callback?.();
  }

  /** Stops at the first failed save so the user can inspect or copy the buffer. */
  async save(): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    try {
      for (const document of this.documents) {
        if (!(await document.save())) return;
      }
      if (this.documents.some((document) => document.isDirty || document.isSaving)) return;
      const callback = this.continuation;
      runInAction(() => {
        this.reset();
      });
      callback?.();
    } finally {
      runInAction(() => {
        this.isSaving = false;
      });
    }
  }

  /** Clears modal state before handing control back to the caller. */
  private reset(): void {
    this.documents = [];
    this.continuation = null;
    this.cancellation = null;
  }
}
