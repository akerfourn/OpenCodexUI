/**
 * Converts an unknown caught value into displayable Git error text.
 *
 * @param error Unknown caught error.
 * @returns Error message.
 */
export function readErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string" && message.length > 0) {
      return message;
    }
  }

  return String(error);
}
