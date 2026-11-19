import { Component, type ReactNode } from "react";

interface FileViewerBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
  onError?(error: Error): void;
}

/** React requires a class for render error boundaries; document state lives outside it. */
export class FileViewerBoundary extends Component<FileViewerBoundaryProps, { failed: boolean }> {
  /** A failed viewer must not unmount the project, chat, or retained document catalogue. */
  override state = { failed: false };

  /** Stops a failed lazy editor or unsupported browser capability at the viewer boundary. */
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  /** Reports a render failure once at its boundary while retaining the fallback buffer. */
  override componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  /** Keeps the buffer accessible through the read-only fallback. */
  override render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
