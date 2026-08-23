/**
 * Normalizes LaTeX delimiters commonly emitted by language models.
 *
 * `remark-math` uses dollar delimiters, while LaTeX-oriented responses often
 * use `\(...\)` and `\[...\]`. This compatibility pass runs before Markdown
 * parsing and deliberately leaves fenced and inline code untouched.
 */

type FenceCharacter = "`" | "~";

type FencedCodeState = {
  character: FenceCharacter;
  length: number;
};

type LatexDelimiterState = {
  fencedCode: FencedCodeState | null;
  inlineCodeLength: number;
  inlineMath: boolean;
  displayMath: boolean;
};

const lineBreakPattern = /\r\n|\r|\n/;

/**
 * Converts LaTeX-style math delimiters to `remark-math` delimiters.
 *
 * @param markdown Markdown content to normalize.
 * @returns Markdown content with compatible math delimiters.
 */
export function normalizeLatexDelimiters(markdown: string): string {
  const parts = markdown.split(/(\r\n|\r|\n)/);
  const state: LatexDelimiterState = {
    fencedCode: null,
    inlineCodeLength: 0,
    inlineMath: false,
    displayMath: false
  };

  return parts
    .map((part) => normalizeMarkdownPart(part, state))
    .join("");
}

/**
 * Normalizes one Markdown line or preserves one line break.
 *
 * @param part Markdown line or line break.
 * @param state Delimiter state shared across lines.
 * @returns Normalized line or unchanged line break.
 */
function normalizeMarkdownPart(part: string, state: LatexDelimiterState): string {
  if (lineBreakPattern.test(part)) {
    return part;
  }

  if (state.fencedCode !== null) {
    if (isClosingFence(part, state.fencedCode)) {
      state.fencedCode = null;
    }

    return part;
  }

  const openingFence = readOpeningFence(part);

  if (openingFence !== null) {
    state.fencedCode = openingFence;
    return part;
  }

  return normalizeMarkdownLine(part, state);
}

/**
 * Reads a fenced-code opener at the beginning of a Markdown line.
 *
 * @param line Markdown line.
 * @returns Fence information, or `null` when the line is ordinary Markdown.
 */
function readOpeningFence(line: string): FencedCodeState | null {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})/);

  if (match === null) {
    return null;
  }

  const fenceSequence = match[1];

  if (fenceSequence === undefined) {
    return null;
  }

  return {
    character: fenceSequence[0] as FenceCharacter,
    length: fenceSequence.length
  };
}

/**
 * Checks whether a line closes a previously opened fenced code block.
 *
 * @param line Markdown line.
 * @param fence Expected fence character and minimum length.
 * @returns Whether the line is a valid closing fence.
 */
function isClosingFence(line: string, fence: FencedCodeState): boolean {
  let index = 0;

  while (index < line.length && index < 3 && line[index] === " ") {
    index += 1;
  }

  let repeatedCharacters = 0;

  while (line[index + repeatedCharacters] === fence.character) {
    repeatedCharacters += 1;
  }

  if (repeatedCharacters < fence.length) {
    return false;
  }

  return line.slice(index + repeatedCharacters).trim() === "";
}

/**
 * Normalizes math delimiters while preserving inline code spans.
 *
 * @param line Markdown line.
 * @param state Delimiter state shared across lines.
 * @returns Normalized Markdown line.
 */
function normalizeMarkdownLine(line: string, state: LatexDelimiterState): string {
  let normalized = "";
  let index = 0;

  while (index < line.length) {
    if (state.inlineCodeLength > 0) {
      const codeFence = "`".repeat(state.inlineCodeLength);

      if (line.startsWith(codeFence, index)) {
        normalized += codeFence;
        index += state.inlineCodeLength;
        state.inlineCodeLength = 0;
        continue;
      }

      normalized += line[index];
      index += 1;
      continue;
    }

    if (line[index] === "`") {
      const codeFenceLength = readBacktickRunLength(line, index);
      const codeFence = "`".repeat(codeFenceLength);

      normalized += codeFence;
      index += codeFenceLength;
      state.inlineCodeLength = codeFenceLength;
      continue;
    }

    const delimiter = line.slice(index, index + 2);

    if (state.displayMath && delimiter === "\\]") {
      normalized += "$$";
      index += 2;
      state.displayMath = false;
      continue;
    }

    if (state.inlineMath && delimiter === "\\)") {
      normalized += "$";
      index += 2;
      state.inlineMath = false;
      continue;
    }

    if (!state.displayMath && !state.inlineMath && delimiter === "\\[") {
      normalized += "$$";
      index += 2;
      state.displayMath = true;
      continue;
    }

    if (!state.displayMath && !state.inlineMath && delimiter === "\\(") {
      normalized += "$";
      index += 2;
      state.inlineMath = true;
      continue;
    }

    normalized += line[index];
    index += 1;
  }

  return normalized;
}

/**
 * Counts consecutive backticks beginning at a line position.
 *
 * @param line Markdown line.
 * @param startIndex First backtick position.
 * @returns Number of consecutive backticks.
 */
function readBacktickRunLength(line: string, startIndex: number): number {
  let length = 0;

  while (line[startIndex + length] === "`") {
    length += 1;
  }

  return length;
}
