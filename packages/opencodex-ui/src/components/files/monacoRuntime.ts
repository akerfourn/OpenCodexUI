import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/basic-languages/monaco.contribution";
import "monaco-editor/editor/browser/coreCommands";
import "monaco-editor/editor/contrib/find/browser/findController";
import "monaco-editor/editor/contrib/clipboard/browser/clipboard";
import "monaco-editor/editor/contrib/contextmenu/browser/contextmenu";
import "monaco-editor/editor/contrib/bracketMatching/browser/bracketMatching";
import "monaco-editor/editor/contrib/wordOperations/browser/wordOperations";
import "monaco-editor/editor/contrib/linesOperations/browser/linesOperations";
import "monaco-editor/editor/contrib/hover/browser/hoverContribution";
import "monaco-editor/editor/standalone/browser/quickAccess/standaloneGotoLineQuickAccess";
import { jsonDefaults } from "monaco-editor/languages/features/json/register.js";
import JsonWorker from "monaco-editor/languages/features/json/json.worker.js?worker";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
import type { FileDocument } from "../../stores/files/FileDocument";

// Vite bundles the worker beside the app; no CDN or runtime download is used.
globalThis.MonacoEnvironment = {
  getWorker: (_moduleId, label) => (label === "json" ? new JsonWorker() : new EditorWorker())
};
// No remote schema downloads: JSON support remains fully offline.
jsonDefaults.setDiagnosticsOptions({ validate: true, allowComments: true, enableSchemaRequest: false });

/** Model lifetime follows the document, preserving undo across viewer unmounts. */
const models = new WeakMap<FileDocument, monaco.editor.ITextModel>();

/** Resolves language registration by extension or a well-known filename. */
function languageFor(document: FileDocument): string {
  if (document.virtualLanguage !== undefined) return document.virtualLanguage;
  const name = document.name.toLowerCase();
  for (const language of monaco.languages.getLanguages()) {
    if (
      language.filenames?.some((filename) => filename.toLowerCase() === name) ||
      language.extensions?.some((extension) => name.endsWith(extension.toLowerCase()))
    )
      return language.id;
  }
  return "plaintext";
}

/** Returns the sole editor model for this document and registers lifetime cleanup. */
export function modelFor(document: FileDocument): monaco.editor.ITextModel {
  let model = models.get(document);
  if (model !== undefined) return model;
  const uri = monaco.Uri.from({
    scheme: "opencodex-document",
    path: `/${encodeURIComponent(document.id)}/${document.name}`
  });
  model = monaco.editor.createModel(document.content, languageFor(document), uri);
  model.setEOL(monaco.editor.EndOfLineSequence.LF);
  models.set(document, model);
  const ownedModel = model;
  const subscription = model.onDidChangeContent(() => document.edit(ownedModel.getValue()));
  document.onDispose(() => {
    subscription.dispose();
    ownedModel.dispose();
    models.delete(document);
  });
  return model;
}

export { monaco };
