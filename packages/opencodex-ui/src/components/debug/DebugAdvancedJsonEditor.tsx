import { useEffect, useMemo, useRef, useState } from "react";
import { observer } from "mobx-react-lite";
import { Alert, Box, useTheme } from "@mui/material";
import { useTranslation } from "react-i18next";
import { jsonDefaults } from "monaco-editor/languages/features/json/register.js";
import "monaco-editor/editor/contrib/suggest/browser/suggestController";
import { fileHighlighting, monaco } from "../files/monacoRuntime";
import { debugAdvancedSchema } from "./debugAdvancedSchema";
import { parseDebugAdvancedJson } from "../../stores/debug/debugAdvancedDraft";

/** Owns an isolated transient JSON model; closing the editor leaves the draft in its parent. */
export function DebugAdvancedJsonEditor({ value, onChange }: { value: string; onChange(value: string): void }) {
  const container = useRef<HTMLDivElement>(null);
  const modelRef = useRef<monaco.editor.ITextModel | null>(null);
  const changed = useRef(onChange);
  changed.current = onChange;
  const initial = useRef(value);
  const { t } = useTranslation();
  const theme = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [uri] = useState(() => monaco.Uri.parse(`opencodex-debug-options:/${crypto.randomUUID()}.json`));
  const schema = useMemo(() => debugAdvancedSchema({
    sourceMaps: t("debug.advanced.options.sourceMaps"), smartStep: t("debug.advanced.options.smartStep"),
    skipFiles: t("debug.advanced.options.skipFiles"), outFiles: t("debug.advanced.options.outFiles"),
    resolveSourceMapLocations: t("debug.advanced.options.resolveSourceMapLocations"),
    sourceMapPathOverrides: t("debug.advanced.options.sourceMapPathOverrides")
  }), [t]);

  useEffect(() => {
    if (container.current === null) return;
    const model = monaco.editor.createModel(initial.current, "json", uri);
    modelRef.current = model;
    const editor = monaco.editor.create(container.current, {
      model, automaticLayout: true, minimap: { enabled: false }, scrollBeyondLastLine: false,
      fontSize: 13, tabSize: 2, wordWrap: "on", fixedOverflowWidgets: true,
      ariaLabel: t("debug.advanced.jsonButton")
    });
    /** Per-model strict diagnostics leave the file module's comment-friendly JSON defaults unchanged. */
    function validate(): void {
      let markers: monaco.editor.IMarkerData[] = [];
      try { parseDebugAdvancedJson(model.getValue()); }
      catch (failure) {
        markers = [{ severity: monaco.MarkerSeverity.Error, message: String(failure),
          startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: model.getLineMaxColumn(1) }];
      }
      monaco.editor.setModelMarkers(model, "debug-options", markers);
    }
    validate();
    const subscription = model.onDidChangeContent(() => {
      validate();
      changed.current(model.getValue());
    });
    return () => {
      subscription.dispose();
      editor.dispose();
      model.dispose();
      modelRef.current = null;
    };
  }, [uri]);

  useEffect(() => {
    const schemaUri = `${uri.toString()}.schema`;
    jsonDefaults.setDiagnosticsOptions({ ...jsonDefaults.diagnosticsOptions, schemas: [
      ...(jsonDefaults.diagnosticsOptions.schemas ?? []),
      { uri: schemaUri, fileMatch: [uri.toString()], schema: { ...schema, allowComments: false, allowTrailingCommas: false } }
    ] });
    return () => {
      jsonDefaults.setDiagnosticsOptions({ ...jsonDefaults.diagnosticsOptions,
        schemas: jsonDefaults.diagnosticsOptions.schemas?.filter(item => item.uri !== schemaUri) });
    };
  }, [uri, schema]);

  useEffect(() => {
    fileHighlighting.setTheme(theme.palette.mode);
  }, [theme.palette.mode]);

  useEffect(() => {
    let disposed = false;
    void fileHighlighting.ensureLanguage("json").catch(failure => {
      if (!disposed) setError(String(failure));
    });
    return () => { disposed = true; };
  }, []);

  useEffect(() => {
    const model = modelRef.current;
    if (model !== null && model.getValue() !== value) model.setValue(value);
  }, [value]);

  let feedback;
  if (error !== null) feedback = <Alert severity="warning">{t("fileLanguages.loadError")} {error}</Alert>;
  return <>
    {feedback}
    <Box ref={container} sx={{ height: 300, border: 1, borderColor: "divider" }} />
  </>;
}
export const DebugAdvancedJsonEditorX = observer(DebugAdvancedJsonEditor);
