import { detectFileLanguage } from "../../features/fileLanguages/catalogue";
import { runInAction } from "mobx";
import { sameDebugContext } from "@open-codex-ui/opencodex-protocol";
import type { DebugSessionSnapshot, DebugSource, OpenCodexFileContext } from "@open-codex-ui/opencodex-protocol";
import type { FileDocument, DocumentGutterMarker } from "../files/FileDocument";
import type { DebugStore } from "./DebugStore";

/** Compares source paths without resolving a non-local filesystem on the renderer host. */
export function workspaceRelativeSource(root: string, source: string): string | null {
  const normalizedRoot = root.replaceAll("\\", "/").replace(/\/$/, "");
  const normalizedSource = source.replaceAll("\\", "/");
  const windows = /^[A-Za-z]:/.test(normalizedRoot) || normalizedRoot.startsWith("//");
  const base = windows ? normalizedRoot.toLowerCase() : normalizedRoot;
  const candidate = windows ? normalizedSource.toLowerCase() : normalizedSource;
  if (!candidate.startsWith(`${base}/`)) return null;
  const relative = normalizedSource.slice(normalizedRoot.length + 1);
  if (relative.split("/").includes("..")) return null;
  return relative;
}

/** Presents executed content separately when the filesystem document contains different text. */
export async function openDebugSource(store: DebugStore, session: DebugSessionSnapshot,
  source: DebugSource, content: string, line: number, column: number, current: () => boolean, markExecution = true): Promise<void> {
  const context = session.configuration.context;
  const project = store.root.projectsStore.projectStoresById.get(context.projectId);
  if (!project || project.files.isDisposed || !current()) return;
  const relative = workspaceRelativeSource(context.workspacePath, source.path ?? "");
  const normalized = content.replace(/\r\n/g, "\n");
  let document: FileDocument | null = null;
  if (relative !== null && !(source.sourceReference && source.sourceReference > 0)) {
    const candidate = [...project.files.documents.values()].find(item => item.target &&
      sameDebugContext(item.target, context) && item.target.path === relative);
    if (candidate?.snapshot && candidate.content === normalized && !candidate.isDirty) {
      document = candidate;
      document.configureOpen({ origin: "link" }, "file");
      document.position = { line, column };
      project.files.show(document.id);
    }
  }
  if (document === null) {
    const prefix = `debug:${session.id}:${source.sourceReference ?? 0}:${source.path ?? source.name}:`;
    const previous = [...project.files.documents.values()].find(item =>
      item.id.startsWith(`virtual:${prefix}`) && item.content === normalized);
    const id = previous?.id.slice("virtual:".length) ?? `${prefix}${crypto.randomUUID()}`;
    const name = source.name ?? relative ?? source.path ?? "debug-source.js";
    document = project.files.openVirtual(id, `${name} (Debug)`, normalized,
      detectFileLanguage(name), { line, column });
  }
  store.bindDocument(document, context, relative ?? undefined);
  if (markExecution) runInAction(() => { store.execution = { documentId: document!.id, line }; });
}

/** Viewer-neutral gutter state is computed from session/workspace identity, never active selection. */
export function bindDebugDocument(store: DebugStore, document: FileDocument,
  context: OpenCodexFileContext | null, path?: string): void {
  document.gutter = {
    get markers(): DocumentGutterMarker[] {
      const session = store.snapshot.session;
      const statuses = session && context && sameDebugContext(session.configuration.context, context)
        ? session.breakpoints : [];
      const markers: DocumentGutterMarker[] = [];
      if (context && path) {
        for (const item of store.snapshot.preferences.breakpoints) {
          if (!sameDebugContext(item.context, context) || item.path !== path) continue;
          const status = statuses.find(entry => entry.id === item.id);
          let kind: DocumentGutterMarker["kind"] = "requested";
          if (!item.enabled) kind = "disabled";
          else if (status) kind = status.verified ? "verified" : "unresolved";
          markers.push({ line: status?.line ?? item.line, kind, message: status?.message });
        }
      }
      if (store.execution?.documentId === document.id) {
        markers.push({ line: store.execution.line, kind: "execution" });
      }
      return markers;
    },
    toggle(line: number): void {
      if (!context || !path) return;
      const session = store.snapshot.session;
      const statuses = session && sameDebugContext(session.configuration.context, context)
        ? session.breakpoints : [];
      const requested = store.snapshot.preferences.breakpoints.find(item =>
        sameDebugContext(item.context, context) && item.path === path &&
        (statuses.find(status => status.id === item.id)?.line ?? item.line) === line);
      void store.toggleBreakpoint(context, path, requested?.line ?? line);
    }
  };
}
