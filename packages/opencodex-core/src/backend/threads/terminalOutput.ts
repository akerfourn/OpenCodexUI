/**
 * Normalizes terminal output before it crosses UI or file boundaries.
 */

const ansiEscapePattern = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;
const oscEscapePattern = /\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g;
const controlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001A\u001C-\u001F\u007F]/g;

/**
 * Removes terminal control sequences while preserving printable text.
 *
 * @param value Raw terminal output.
 * @returns Plain text safe for UI rendering and persisted logs.
 */
export function sanitizeTerminalOutput(value: string): string {
  return value
    .replace(oscEscapePattern, "")
    .replace(ansiEscapePattern, "")
    .replace(controlCharacterPattern, "");
}
