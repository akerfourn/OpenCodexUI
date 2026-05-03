/**
 * Parses and serializes JSON-RPC lines exchanged with the Codex app-server process.
 */
import type { JsonRpcMessage } from "./types";

/**
 * Parses a single JSON-RPC line and validates its high-level structure.
 *
 * @param line Raw JSON line emitted by the app-server process.
 * @returns Parsed JSON-RPC message object.
 */
export function parseJsonRpcLine(line: string): JsonRpcMessage {
  const trimmedLine = line.trim();

  if (trimmedLine.length === 0) {
    throw new Error("Received an empty JSON-RPC line.");
  }

  const value: unknown = JSON.parse(trimmedLine);

  if (!isRecord(value)) {
    throw new Error("JSON-RPC line must be an object.");
  }

  if ("jsonrpc" in value && value.jsonrpc !== "2.0") {
    throw new Error("JSON-RPC message must use version 2.0.");
  }

  if ("method" in value && typeof value.method !== "string") {
    throw new Error("JSON-RPC method must be a string.");
  }

  if ("id" in value && !isValidId(value.id)) {
    throw new Error("JSON-RPC id must be a string or number.");
  }

  return value as JsonRpcMessage;
}

/**
 * Checks whether a value is a plain object record.
 *
 * @param value Value to validate.
 * @returns `true` when the value is a non-null object and not an array.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Checks whether a value can be used as a JSON-RPC identifier.
 *
 * @param value Value to validate.
 * @returns `true` when the value is a string or a number.
 */
export function isValidId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

/**
 * Serializes a value as a newline-delimited JSON message.
 *
 * @param value JSON-serializable payload to send to the app-server.
 * @returns Serialized line terminated with a newline character.
 */
export function stringifyJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
