/**
 * Normalizes and bounds streamed project-command output before it reaches UI state.
 */

export const MAX_PENDING_OUTPUT_CHARACTERS = 64 * 1024;

export type ConsumedProjectCommandOutput = {
  completedTexts: string[];
  pendingText: string;
};

/**
 * Converts a streamed delta into complete bounded display lines and one partial line.
 *
 * Long lines are split into display chunks so a command that never emits a newline
 * cannot grow the retained pending buffer indefinitely.
 *
 * @param pendingText Partial text retained from the previous delta.
 * @param delta Newly received output.
 * @param maxPendingCharacters Maximum size of a line or retained fragment.
 * @returns Completed display chunks and the next bounded partial fragment.
 */
export function consumeProjectCommandOutput(
  pendingText: string,
  delta: string,
  maxPendingCharacters = MAX_PENDING_OUTPUT_CHARACTERS
): ConsumedProjectCommandOutput {
  assertValidLimit(maxPendingCharacters);

  const text = `${pendingText}${delta.replace(/\r\n?/g, "\n")}`;
  const completedTexts: string[] = [];
  let lineStart = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "\n") {
      continue;
    }

    appendBoundedChunks(completedTexts, text, lineStart, index, maxPendingCharacters, true);
    lineStart = index + 1;
  }

  const pendingStart = appendBoundedChunks(
    completedTexts,
    text,
    lineStart,
    text.length,
    maxPendingCharacters,
    false
  );

  return {
    completedTexts,
    pendingText: text.slice(pendingStart)
  };
}

/**
 * Appends bounded chunks from one logical line.
 *
 * @param target Destination line list.
 * @param value Full normalized output.
 * @param start Inclusive logical-line start.
 * @param end Exclusive logical-line end.
 * @param maxCharacters Maximum chunk size.
 * @param isComplete Whether a newline completed the logical line.
 * @returns Start offset of the remaining partial chunk.
 */
function appendBoundedChunks(
  target: string[],
  value: string,
  start: number,
  end: number,
  maxCharacters: number,
  isComplete: boolean
): number {
  let chunkStart = start;

  while (end - chunkStart > maxCharacters) {
    const chunkEnd = findSafeChunkEnd(value, chunkStart, maxCharacters);
    target.push(value.slice(chunkStart, chunkEnd));
    chunkStart = chunkEnd;
  }

  if (isComplete) {
    target.push(value.slice(chunkStart, end));
    return end;
  }

  return chunkStart;
}

/**
 * Avoids splitting a UTF-16 surrogate pair at a chunk boundary.
 *
 * @param value Source output.
 * @param start Inclusive chunk start.
 * @param maxCharacters Maximum chunk size.
 * @returns Safe exclusive chunk end.
 */
function findSafeChunkEnd(value: string, start: number, maxCharacters: number): number {
  const end = start + maxCharacters;
  const previousCode = value.charCodeAt(end - 1);
  const currentCode = value.charCodeAt(end);
  const splitsPair = (
    previousCode >= 0xd800 &&
    previousCode <= 0xdbff &&
    currentCode >= 0xdc00 &&
    currentCode <= 0xdfff
  );

  return splitsPair ? end - 1 : end;
}

/**
 * Validates the pending-output character budget.
 *
 * @param value Candidate limit.
 */
function assertValidLimit(value: number): void {
  if (!Number.isInteger(value) || value < 2) {
    throw new RangeError("maxPendingCharacters must be an integer greater than one.");
  }
}
