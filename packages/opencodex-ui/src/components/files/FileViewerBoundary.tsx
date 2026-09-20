import { Component, type ReactNode } from "react";

interface FileViewerBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}

/** React requires a class for render error boundaries; document state lives outside it. */
export class FileViewerBoundary extends Component<FileViewerBoundaryProps, { failed: boolean }> {
  /** A failed viewer must not unmount the project, chat, or retained document catalogue. */
  override state = { failed: false };

  /** Stops a failed lazy editor or unsupported browser capability at the viewer boundary. */
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  /** Keeps the buffer accessible through the read-only fallback. */
  override render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
