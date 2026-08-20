/**
 * Converts unknown request errors into displayable chat error text.
 *
 * @param error Unknown caught error.
 * @returns Error message.
 */
export function readChatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
