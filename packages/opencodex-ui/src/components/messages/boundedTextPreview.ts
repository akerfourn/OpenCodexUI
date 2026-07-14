/**
 * Builds small display windows for potentially very large preformatted text.
 */

export const DEFAULT_TEXT_PREVIEW_MAX_LINES = 300;
export const DEFAULT_TEXT_PREVIEW_MAX_CHARACTERS = 64 * 1024;

export type BoundedTextPreviewStrategy = "head-tail" | "tail";

export type BoundedTextPreview = {
  leadingText: string;
  trailingText: string;
  omittedCharacterCount: number;
  isLimited: boolean;
};

export type BoundedTextPreviewOptions = {
  strategy: BoundedTextPreviewStrategy;
  maxLines?: number;
  maxCharacters?: number;
};

/**
 * Derives a bounded view without modifying the full source value.
 *
 * @param value Full source text.
 * @param options Preview strategy and display budgets.
 * @returns Visible text segments and omission metadata.
 */
export function createBoundedTextPreview(
  value: string,
  options: BoundedTextPreviewOptions
): BoundedTextPreview {
  const maxLines = options.maxLines ?? DEFAULT_TEXT_PREVIEW_MAX_LINES;
  const maxCharacters = options.maxCharacters ?? DEFAULT_TEXT_PREVIEW_MAX_CHARACTERS;

  assertPositiveInteger(maxLines, "maxLines");
  assertPositiveInteger(maxCharacters, "maxCharacters");

  if (value.length <= maxCharacters && !hasMoreLinesThan(value, maxLines)) {
    return createCompletePreview(value);
  }

  if (options.strategy === "tail") {
    return createTailPreview(value, maxLines, maxCharacters);
  }

  return createHeadTailPreview(value, maxLines, maxCharacters);
}

/**
 * Creates a preview containing the complete value.
 *
 * @param value Full source text.
 * @returns Unrestricted preview.
 */
function createCompletePreview(value: string): BoundedTextPreview {
  return {
    leadingText: value,
    trailingText: "",
    omittedCharacterCount: 0,
    isLimited: false
  };
}

/**
 * Creates a preview prioritizing the end of terminal-like output.
 *
 * @param value Full source text.
 * @param maxLines Maximum visible line count.
 * @param maxCharacters Maximum visible character count.
 * @returns Tail preview.
 */
function createTailPreview(
  value: string,
  maxLines: number,
  maxCharacters: number
): BoundedTextPreview {
  const lineStart = findTailStart(value, maxLines);
  const characterStart = Math.max(value.length - maxCharacters, 0);
  const start = moveStartPastSplitSurrogate(value, Math.max(lineStart, characterStart));

  return {
    leadingText: "",
    trailingText: value.slice(start),
    omittedCharacterCount: start,
    isLimited: start > 0
  };
}

/**
 * Creates a preview preserving context at both ends of diff-like output.
 *
 * @param value Full source text.
 * @param maxLines Maximum visible line count.
 * @param maxCharacters Maximum visible character count.
 * @returns Head-and-tail preview.
 */
function createHeadTailPreview(
  value: string,
  maxLines: number,
  maxCharacters: number
): BoundedTextPreview {
  const leadingLineBudget = Math.ceil(maxLines / 2);
  const trailingLineBudget = Math.floor(maxLines / 2);
  const leadingCharacterBudget = Math.ceil(maxCharacters / 2);
  const trailingCharacterBudget = Math.floor(maxCharacters / 2);

  const lineEnd = findHeadEnd(value, leadingLineBudget);
  const characterEnd = Math.min(leadingCharacterBudget, value.length);
  const end = moveEndBeforeSplitSurrogate(value, Math.min(lineEnd, characterEnd));

  const lineStart = findTailStart(value, Math.max(trailingLineBudget, 1));
  const characterStart = Math.max(value.length - trailingCharacterBudget, 0);
  const start = moveStartPastSplitSurrogate(value, Math.max(lineStart, characterStart));

  if (end >= start) {
    return createCompletePreview(value);
  }

  return {
    leadingText: value.slice(0, end),
    trailingText: value.slice(start),
    omittedCharacterCount: start - end,
    isLimited: true
  };
}

/**
 * Reports whether text exceeds a line budget, stopping as soon as possible.
 *
 * @param value Source text.
 * @param maxLines Maximum allowed lines.
 * @returns Whether another line exists beyond the budget.
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
 * Finds the exclusive end offset for the requested leading lines.
 *
 * @param value Source text.
 * @param maxLines Leading line budget.
 * @returns Exclusive end offset.
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
 * Finds the inclusive start offset for the requested trailing lines.
 *
 * @param value Source text.
 * @param maxLines Trailing line budget.
 * @returns Start offset.
 */
function findTailStart(value: string, maxLines: number): number {
  let lineBreakCount = 0;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    const character = value[index];

    if (character !== "\n" && character !== "\r") {
      continue;
    }

    const isCrLfEnd = character === "\n" && index > 0 && value[index - 1] === "\r";

    if (isCrLfEnd) {
      index -= 1;
    }

    lineBreakCount += 1;

    if (lineBreakCount === maxLines) {
      return isCrLfEnd ? index + 2 : index + 1;
    }
  }

  return 0;
}

/**
 * Moves a start boundary past a split UTF-16 surrogate pair.
 *
 * @param value Source text.
 * @param start Candidate start offset.
 * @returns Safe start offset.
 */
function moveStartPastSplitSurrogate(value: string, start: number): number {
  if (start <= 0 || start >= value.length) {
    return start;
  }

  const previousCode = value.charCodeAt(start - 1);
  const currentCode = value.charCodeAt(start);
  const splitsPair = isHighSurrogate(previousCode) && isLowSurrogate(currentCode);

  return splitsPair ? start + 1 : start;
}

/**
 * Moves an end boundary before a split UTF-16 surrogate pair.
 *
 * @param value Source text.
 * @param end Candidate exclusive end offset.
 * @returns Safe exclusive end offset.
 */
function moveEndBeforeSplitSurrogate(value: string, end: number): number {
  if (end <= 0 || end >= value.length) {
    return end;
  }

  const previousCode = value.charCodeAt(end - 1);
  const currentCode = value.charCodeAt(end);
  const splitsPair = isHighSurrogate(previousCode) && isLowSurrogate(currentCode);

  return splitsPair ? end - 1 : end;
}

/**
 * Reports whether a UTF-16 code unit starts a surrogate pair.
 *
 * @param code UTF-16 code unit.
 * @returns Whether the code unit is a high surrogate.
 */
function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * Reports whether a UTF-16 code unit ends a surrogate pair.
 *
 * @param code UTF-16 code unit.
 * @returns Whether the code unit is a low surrogate.
 */
function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Validates a display budget.
 *
 * @param value Candidate budget.
 * @param name Option name used in the error.
 */
function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer.`);
  }
}
