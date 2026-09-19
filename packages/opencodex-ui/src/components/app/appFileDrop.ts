import type { OpenCodexAttachment } from "@open-codex-ui/opencodex-protocol";
import { readFileAttachments, readTransferFiles } from "../chat/fileAttachments";

/** Captures the destination when files are dropped, so switching chats cannot redirect a read. */
export interface FileDropTarget {
  addAttachments(attachments: OpenCodexAttachment[]): void;
}

/** Window drag events and UI feedback needed by the file drop handler. */
export interface FileDropOptions {
  getTarget(): FileDropTarget | null;
  onHover(isHovering: boolean): void;
  onError(error: unknown): void;
  directoryError: string;
}

/** Registers file-only handlers; text/link drags keep their normal browser behavior. */
export function registerAppFileDrop(surface: Window, options: FileDropOptions): () => void {
  let depth = 0;

  /** Clears the overlay when the drag exits or ends. */
  function reset(): void {
    depth = 0;
    options.onHover(false);
  }

  /** Identifies file drags even while the browser protects their contents during hover. */
  function isFileDrag(event: DragEvent): boolean {
    return event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes("Files");
  }

  /** Captures only files, preventing browser navigation and duplicate editor handling. */
  function capture(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  /** Counts nested drag boundaries so moving across child elements does not flicker. */
  function enter(event: DragEvent): void {
    if (!isFileDrag(event)) { return; }
    capture(event);
    depth += 1;
    options.onHover(true);
  }

  /** Advertises whether the active chat can currently accept attachments. */
  function over(event: DragEvent): void {
    if (!isFileDrag(event)) { return; }
    capture(event);
    event.dataTransfer!.dropEffect = options.getTarget() === null ? "none" : "copy";
  }

  /** Hides the overlay only after leaving the whole window. */
  function leave(event: DragEvent): void {
    if (!isFileDrag(event) && depth === 0) { return; }
    depth = Math.max(0, depth - 1);
    if (depth === 0) { reset(); }
  }

  /** Adds the entire readable selection atomically to the chat selected at drop time. */
  function drop(event: DragEvent): void {
    reset();
    if (!isFileDrag(event)) { return; }
    capture(event);
    const target = options.getTarget();
    if (target === null) { return; }
    const transfer = event.dataTransfer!;
    if (Array.from(transfer.items).some((item) => item.webkitGetAsEntry?.()?.isDirectory === true)) {
      options.onError(new Error(options.directoryError));
      return;
    }
    const files = readTransferFiles(transfer);
    void readFileAttachments(files).then((attachments) => {
      target.addAttachments(attachments);
    }).catch(options.onError);
  }

  surface.addEventListener("dragenter", enter, true);
  surface.addEventListener("dragover", over, true);
  surface.addEventListener("dragleave", leave, true);
  surface.addEventListener("drop", drop, true);
  surface.addEventListener("dragend", reset, true);
  surface.addEventListener("blur", reset);
  return () => {
    surface.removeEventListener("dragenter", enter, true);
    surface.removeEventListener("dragover", over, true);
    surface.removeEventListener("dragleave", leave, true);
    surface.removeEventListener("drop", drop, true);
    surface.removeEventListener("dragend", reset, true);
    surface.removeEventListener("blur", reset);
  };
}
