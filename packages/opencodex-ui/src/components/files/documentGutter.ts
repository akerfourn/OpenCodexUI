import { reaction } from "mobx";
import type { FileDocument } from "../../stores/files/FileDocument";
import { monaco } from "./monacoRuntime";
import "./documentGutter.css";

/** Installs annotations and margin interaction without coupling Monaco to a debug adapter. */
export function attachDocumentGutter(editor: monaco.editor.IStandaloneCodeEditor, document: FileDocument): () => void {
  editor.updateOptions({ glyphMargin: true });
  const decorations = editor.createDecorationsCollection();
  const stop = reaction(() => document.gutter?.markers ?? [], markers => {
    decorations.set(markers.map(marker => ({
      range: new monaco.Range(marker.line, 1, marker.line, 1),
      options: {
        isWholeLine: marker.kind === "execution",
        className: marker.kind === "execution" ? "debug-execution-line" : undefined,
        glyphMarginClassName: `debug-glyph debug-glyph-${marker.kind}`,
        glyphMarginHoverMessage: marker.message ? { value: marker.message } : undefined,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges
      }
    })));
  }, { fireImmediately: true });
  const mouse = editor.onMouseDown(event => {
    if (event.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN && event.target.position) {
      document.gutter?.toggle(event.target.position.lineNumber);
    }
  });
  return () => { stop(); mouse.dispose(); decorations.clear(); };
}
