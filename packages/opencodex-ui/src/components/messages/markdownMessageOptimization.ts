/**
 * Computes bounded display windows for large Markdown messages.
 */

/** Content size at which a completed message uses progressive rendering. */
export const LARGE_MARKDOWN_CHARACTER_THRESHOLD = 16 * 1024;

/** Line count at which a completed message uses progressive rendering. */
export const LARGE_MARKDOWN_LINE_THRESHOLD = 240;

/** Maximum number of characters parsed for the initial Markdown preview. */
export const MARKDOWN_PREVIEW_CHARACTER_LIMIT = 8 * 1024;

/** Maximum number of lines parsed for the initial Markdown preview. */
export const MARKDOWN_PREVIEW_LINE_LIMIT = 120;

export type MarkdownContentProfile = {
  isLarge: boolean;
  preview: MarkdownContentPreview;
};

export type MarkdownContentPreview = {
  markdown: string;
  omittedCharacterCount: number;
  isLimited: boolean;
};

/**
 * Classifies a Markdown value and builds the bounded content used initially.
 *
 * @param value Complete Markdown source.
 * @returns Size classification and a safe leading preview.
 */
export function createMarkdownContentProfile(value: string): MarkdownContentProfile {
  const isLarge = value.length > LARGE_MARKDOWN_CHARACTER_THRESHOLD
    || hasMoreLinesThan(value, LARGE_MARKDOWN_LINE_THRESHOLD);

  if (!isLarge) {
    return {
      isLarge: false,
      preview: {
        markdown: value,
        omittedCharacterCount: 0,
        isLimited: false
      }
    };
  }

  const previewEnd = findPreviewEnd(
    value,
    MARKDOWN_PREVIEW_LINE_LIMIT,
    MARKDOWN_PREVIEW_CHARACTER_LIMIT
  );
  const previewMarkdown = closeOpenCodeFence(value.slice(0, previewEnd));

  return {
    isLarge: true,
    preview: {
      markdown: previewMarkdown,
      omittedCharacterCount: value.length - previewEnd,
      isLimited: previewEnd < value.length
    }
  };
}

/**
 * Finds a preview boundary without cutting a complete line when possible.
 *
 * @param value Complete Markdown source.
 * @param maxLines Maximum number of visible lines.
 * @param maxCharacters Maximum number of visible characters.
 * @returns Exclusive source offset for the preview.
 */
function findPreviewEnd(value: string, maxLines: number, maxCharacters: number): number {
  const lineEnd = findHeadEnd(value, maxLines);
  let end = Math.min(lineEnd, maxCharacters, value.length);

  if (end < lineEnd) {
    const lineBoundary = findLastLineBoundary(value, end);

    if (lineBoundary > 0) {
      end = lineBoundary;
    }
  }

  return moveEndBeforeSplitSurrogate(value, end);
}

/**
 * Finds the exclusive end offset for a leading line window.
 *
 * @param value Complete Markdown source.
 * @param maxLines Maximum number of visible lines.
 * @returns Exclusive source offset.
 */
function findHeadEnd(value: string, maxLines: number): number {
  let lineCount = 1;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character !== "\n" && character !== "\r") {
      continue;
    }

    let end = index + 1;

    if (character === "\r" && value[index + 1] === "\n") {
      end += 1;
      index += 1;
    }

    if (lineCount === maxLines) {
      return end;
    }

    lineCount += 1;
  }

  return value.length;
}

/**
 * Finds the last complete line ending before a character budget.
 *
 * @param value Complete Markdown source.
 * @param end Candidate exclusive offset.
 * @returns Complete-line offset, or the candidate when no line ending exists.
 */
function findLastLineBoundary(value: string, end: number): number {
  const newlineIndex = value.lastIndexOf("\n", end - 1);
  const carriageReturnIndex = value.lastIndexOf("\r", end - 1);
  const boundaryIndex = Math.max(newlineIndex, carriageReturnIndex);

  if (boundaryIndex < 0) {
    return end;
  }

  if (value[boundaryIndex] === "\r" && value[boundaryIndex + 1] === "\n") {
    return boundaryIndex + 2;
  }

  return boundaryIndex + 1;
}

/**
 * Reports whether a value contains more lines than the supplied budget.
 *
 * @param value Complete Markdown source.
 * @param maxLines Maximum allowed line count.
 * @returns Whether the value exceeds the line budget.
 */
function hasMoreLinesThan(value: string, maxLines: number): boolean {
  let lineCount = 1;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character !== "\n" && character !== "\r") {
      continue;
    }

    if (character === "\r" && value[index + 1] === "\n") {
      index += 1;
    }

    lineCount += 1;

    if (lineCount > maxLines) {
      return true;
    }
  }

  return false;
}

/**
 * Closes a fenced code block cut by the preview boundary.
 *
 * @param value Preview Markdown source.
 * @returns Preview source with a closing fence when one is open.
 */
function closeOpenCodeFence(value: string): string {
  let openFenceCharacter: "`" | "~" | null = null;
  let openFenceLength = 0;

  for (const line of value.split(/\r?\n|\r/)) {
    const match = /^ {0,3}(`{3,}|~{3,})/.exec(line);

    if (match === null) {
      continue;
    }

    const fence = match[1];

    if (fence === undefined) {
      continue;
    }

    const fenceCharacter = fence[0] as "`" | "~";

    if (openFenceCharacter === null) {
      openFenceCharacter = fenceCharacter;
      openFenceLength = fence.length;
      continue;
    }

    if (openFenceCharacter === fenceCharacter && fence.length >= openFenceLength) {
      openFenceCharacter = null;
      openFenceLength = 0;
    }
  }

  if (openFenceCharacter === null) {
    return value;
  }

  return `${value}\n${openFenceCharacter.repeat(openFenceLength)}`;
}

/**
 * Avoids splitting a UTF-16 surrogate pair at the preview boundary.
 *
 * @param value Complete Markdown source.
 * @param end Candidate exclusive offset.
 * @returns Boundary that preserves surrogate pairs.
 */
function moveEndBeforeSplitSurrogate(value: string, end: number): number {
  if (end <= 0 || end >= value.length) {
    return end;
  }

  const previousCode = value.charCodeAt(end - 1);
  const nextCode = value.charCodeAt(end);
  const isHighSurrogate = previousCode >= 0xd800 && previousCode <= 0xdbff;
  const isLowSurrogate = nextCode >= 0xdc00 && nextCode <= 0xdfff;

  return isHighSurrogate && isLowSurrogate ? end - 1 : end;
}
