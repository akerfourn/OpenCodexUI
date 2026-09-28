import JSON5 from "json5";
import type {
  DebugConfiguration, DebugImportEntry, DebugImportIssue, DebugImportPreview, OpenCodexFileContext
} from "@open-codex-ui/opencodex-protocol";
import { importObject, readImportArguments, readImportString } from "./debugImportValues.js";
import { importDebugAdvancedOptions } from "./debugAdvancedImport.js";

/** Parses comment-friendly launch files and projects only explicitly supported adapter fields. */
export function previewDebugImport(
  content: string,
  context: OpenCodexFileContext,
  platform: string,
  idPrefix: string
): DebugImportPreview {
  if (Buffer.byteLength(content, "utf8") > 512 * 1024) {
    throw new Error("launch.json exceeds the 512 KiB import limit.");
  }
  const parsed = importObject(JSON5.parse(content) as unknown);
  if (parsed === null || !Array.isArray(parsed.configurations)) {
    throw new Error("launch.json must contain a configurations array.");
  }
  if (parsed.configurations.length > 100) throw new Error("At most 100 launch configurations can be previewed.");
  const issues: DebugImportIssue[] = [];
  for (const field of Object.keys(parsed)) {
    if (field !== "version" && field !== "configurations") issues.push({ kind: "ignored", field });
  }
  return {
    entries: parsed.configurations.map((entry, index) => convertConfiguration(
      entry, context, platform, `${idPrefix}:${index}`, index
    )),
    issues
  };
}

/** Applies the current host override and records every field the import cannot preserve. */
function convertConfiguration(
  value: unknown,
  context: OpenCodexFileContext,
  platform: string,
  id: string,
  index: number
): DebugImportEntry {
  const issues: DebugImportIssue[] = [];
  const base = importObject(value);
  const fallbackName = `Configuration ${index + 1}`;
  if (base === null) return { name: fallbackName, configuration: null, issues: [{ kind: "invalid", field: "configuration" }] };
  const platformKey = { win32: "windows", darwin: "osx", linux: "linux" }[platform];
  const override = platformKey === undefined ? undefined : base[platformKey];
  const platformFields = importObject(override);
  if (override !== undefined && platformFields === null) issues.push({ kind: "invalid", field: platformKey! });
  const raw = { ...base, ...platformFields };
  const name = typeof raw.name === "string" && raw.name.trim().length > 0 ? raw.name : fallbackName;
  let target: DebugConfiguration["target"];
  if (raw.type === "node" || raw.type === "pwa-node") target = "node";
  else if (raw.type === "chrome" || raw.type === "pwa-chrome") target = "chrome";
  else return { name, configuration: null, issues: [{ kind: "unsupported", field: `type: ${String(raw.type)}` }] };
  if (raw.request !== "launch" && raw.request !== "attach") {
    return { name, configuration: null, issues: [{ kind: "unsupported", field: `request: ${String(raw.request)}` }] };
  }
  if (raw.request === "attach") {
    const targetField = ["processId", "browserURL", "websocketAddress"].find(field => raw[field] !== undefined);
    if (targetField !== undefined) {
      return { name, configuration: null, issues: [{ kind: "unsupported", field: targetField }] };
    }
  }
  if (raw.request === "attach" && raw.address !== undefined &&
      raw.address !== "127.0.0.1" && raw.address !== "localhost") {
    return { name, configuration: null, issues: [{ kind: "unsupported", field: "address (local only)" }] };
  }

  const config: DebugConfiguration = { id, name, context: { ...context }, adapter: "javascript", target, request: raw.request };
  const consumed = new Set(["name", "type", "request", "linux", "windows", "osx"]);
  /** Converts a supported string field and reports values that require manual completion. */
  function copy(field: string, destination: "program" | "cwd" | "runtime" | "url" | "urlFilter" | "webRoot"): void {
    consumed.add(field);
    const text = readImportString(raw[field], field, context, platform, issues);
    if (text !== undefined) config[destination] = text;
  }
  copy("cwd", "cwd");
  if (target === "chrome") copy("webRoot", "webRoot");
  if (raw.request === "launch") {
    copy("runtimeExecutable", "runtime");
    if (target === "node") copy("program", "program");
    else copy("url", "url");
    const field = target === "node" ? "args" : "runtimeArgs";
    consumed.add(field);
    config.args = readImportArguments(raw[field], field, context, platform, issues);
  } else {
    consumed.add("address");
    consumed.add("port");
    config.port = target === "node" ? 9229 : 9222;
    if (raw.port !== undefined) {
      if (typeof raw.port === "number" && Number.isInteger(raw.port) && raw.port > 0 && raw.port <= 65535) {
        config.port = raw.port;
      } else {
        config.port = undefined;
        issues.push({ kind: "invalid", field: "port" });
      }
    }
    if (target === "chrome") copy("urlFilter", "urlFilter");
  }

  importDebugAdvancedOptions(raw, config, platform, consumed, issues);
  for (const [field, equivalent] of Object.entries({
    autoAttachChildProcesses: false, stopOnEntry: false,
    restart: false, console: "internalConsole"
  })) {
    if (raw[field] === equivalent) consumed.add(field);
  }
  for (const field of Object.keys(raw)) {
    if (!consumed.has(field)) issues.push({ kind: "ignored", field });
  }
  const required = target === "node" ? "program" : "url";
  if (raw.request === "launch" && !config[required]?.trim()) issues.push({ kind: "invalid", field: required });
  if (target === "chrome" && raw.request === "attach" && !config.urlFilter?.trim()) {
    issues.push({ kind: "invalid", field: "urlFilter" });
  }
  return { name, configuration: config, issues };
}
