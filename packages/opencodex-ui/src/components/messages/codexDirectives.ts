/** Supported presentation hints; unknown or incomplete syntax stays literal. */
export interface CodexDirective {
  start: number;
  end: number;
  kind: "file-citation" | "followup";
  label: string;
  value: string;
}

/** Reads one quoted value without interpreting paths as JavaScript escapes. */
function quoted(source: string, start: number): { value: string; end: number } | null {
  const quote = source[start];
  if (quote !== '"' && quote !== "'") return null;
  let value = "";
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (character === quote) return { value, end: index + 1 };
    if (character === "\\" && source[index + 1] === quote) {
      value += quote;
      index += 1;
    } else value += character;
  }
  return null;
}

/** Parses only quoted attributes, including the attribute-only citation variant. */
function attributes(source: string, start: number, bracket: boolean) {
  const values: Record<string, string> = Object.create(null);
  let index = start + 1;
  while (index < source.length) {
    while (/\s/.test(source[index] ?? "") && index < source.length) index += 1;
    if (source[index] === "}" || (bracket && source[index] === "]")) return { values, end: index + 1 };
    const key = /^[a-zA-Z][\w-]*\s*=\s*/.exec(source.slice(index));
    if (key === null) return null;
    const name = key[0].slice(0, key[0].indexOf("=")).trim();
    if (Object.hasOwn(values, name)) return null;
    const value = quoted(source, index + key[0].length);
    if (value === null) return null;
    values[name] = value.value;
    index = value.end;
  }
  return null;
}

/** Recognizes the two observed Codex directives without executing their payloads. */
export function parseCodexDirectives(source: string): CodexDirective[] {
  const result: CodexDirective[] = [];
  const pattern = /:codex-(file-citation|followup)(?=[\[{])/g;
  for (let match = pattern.exec(source); match !== null; match = pattern.exec(source)) {
    const kind = match[1] as CodexDirective["kind"];
    let index = pattern.lastIndex;
    let label = "";
    const bracket = kind === "file-citation" && /^\[\s*path\s*=/.test(source.slice(index));
    if (source[index] === "[" && !bracket) {
      const end = source.indexOf("]", index + 1);
      if (end < 0) continue;
      label = source.slice(index + 1, end);
      index = end + 1;
    }
    if (!bracket && source[index] !== "{") continue;
    const parsed = attributes(source, index, bracket);
    if (parsed === null) continue;
    const value = parsed.values[kind === "followup" ? "prompt" : "path"];
    if (value === undefined || value.trim().length === 0 || /[\u0000-\u0008]/.test(value)) continue;
    if (kind === "file-citation" && !isFilePath(value)) continue;
    if (label.length === 0) label = kind === "followup" ? value : value.split(/[\\/]/).at(-1) ?? value;
    result.push({ start: match.index, end: parsed.end, kind, label, value });
    pattern.lastIndex = parsed.end;
  }
  return result;
}

/** Accepts filesystem references, never command or web URL schemes. */
function isFilePath(value: string): boolean {
  return !/^[a-z][a-z\d+.-]*:/i.test(value) || /^[a-z]:[\\/]/i.test(value);
}
