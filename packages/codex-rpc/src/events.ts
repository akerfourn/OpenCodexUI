import type { JsonRpcMessage } from "./types";

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

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isValidId(value: unknown): value is string | number {
  return typeof value === "string" || typeof value === "number";
}

export function stringifyJsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}
