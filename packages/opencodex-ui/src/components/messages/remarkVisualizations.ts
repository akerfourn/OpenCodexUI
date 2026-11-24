import type { CompileContext, Extension as MarkdownExtension } from "mdast-util-from-markdown";
import type { Code, Extension, State, Token, Tokenizer } from "micromark-util-types";
import type {} from "remark-parse";
import type { Processor } from "unified";

import { readVisualizationFilePath } from "../../stores/files/chatVisualizationLoader";

declare module "micromark-util-types" {
  interface TokenTypeMap {
    codexVisualization: "codexVisualization";
  }
}

interface VisualizationReference {
  path: string;
  title?: string;
  mode?: "wide";
}

const markerStart = 0xe200;
const markerPattern = /^\uE200visualize\uE202(.+)\uE201[\t ]*$/u;

/** Identifies a literal marker line before math delimiter normalization. */
export function isVisualizationReferenceLine(line: string): boolean {
  return markerPattern.test(line.trimStart());
}

/** Registers a Markdown block so JSON remains literal and fenced examples remain code. */
export function remarkVisualizations(this: Processor): void {
  const data = this.data();
  const syntax: Extension = { flow: { [markerStart]: { tokenize: tokenizeVisualization } } };
  const markdown: MarkdownExtension = { exit: { codexVisualization: exitVisualization } };
  (data.micromarkExtensions ??= []).push(syntax);
  (data.fromMarkdownExtensions ??= []).push(markdown);
}

/** Accepts a single complete marker and rolls back to normal Markdown on invalid input. */
const tokenizeVisualization: Tokenizer = function (effects, ok, nok) {
  const context = this;
  let token: Token;
  return start;

  /** Captures the whole source line, including JSON escape sequences. */
  function start(code: Code): State | undefined {
    token = effects.enter("codexVisualization");
    return readLine(code);
  }

  /** Bounds an individual marker without consuming the following line. */
  function readLine(code: Code): State | undefined {
    // Micromark reserves codes below -2 for CR, LF and CRLF.
    if (code === null || code < -2) {
      effects.exit("codexVisualization");
      return (parseReference(context.sliceSerialize(token)) === null ? nok : ok)(code);
    }
    if (context.now().offset - token.start.offset >= 8192) return nok(code);
    effects.consume(code);
    return readLine;
  }
};

/** Emits a block element mapped exclusively to the local visualization component. */
function exitVisualization(this: CompileContext, token: Token): void {
  const reference = parseReference(this.sliceSerialize(token));
  if (reference === null) return;
  this.enter({
    type: "paragraph",
    children: [],
    data: {
      hName: "codex-visualization",
      hProperties: {
        "data-visualization-path": reference.path,
        "data-visualization-title": reference.title,
        "data-visualization-mode": reference.mode
      }
    }
  }, token);
  this.exit(token);
}

/** Checks the wire payload before creating any component or file request. */
function parseReference(line: string): VisualizationReference | null {
  const payload = markerPattern.exec(line)?.[1];
  if (payload === undefined) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || !("path" in parsed)
    || typeof parsed.path !== "string" || readVisualizationFilePath(parsed.path) === null) return null;

  const title = "title" in parsed && typeof parsed.title === "string" ? parsed.title.trim() : undefined;
  const mode = "mode" in parsed && parsed.mode === "wide" ? "wide" : undefined;
  return { path: parsed.path.trim(), title, mode };
}
