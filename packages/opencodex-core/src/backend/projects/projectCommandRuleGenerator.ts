/**
 * Generates the OpenCodexUI-managed project command rules file.
 */
import crypto from "node:crypto";

import type { OpenCodexProjectCommandRule } from "@open-codex-ui/opencodex-protocol";

const managedHeader = [
  "# This file is managed by OpenCodexUI.",
  "# Manual edits may be overwritten.",
  ""
].join("\n");

/**
 * Renders enabled project rules as deterministic Starlark-like source.
 *
 * @param rules Rules to render.
 * @returns Generated file content with a trailing newline.
 */
export function renderProjectCommandRules(rules: OpenCodexProjectCommandRule[]): string {
  const enabledRules = rules.filter((rule) => rule.enabled);

  if (enabledRules.length === 0) {
    return managedHeader;
  }

  const renderedRules = enabledRules.map(renderRule).join("\n\n");
  return `${managedHeader}${renderedRules}\n`;
}

/**
 * Computes the content hash used to detect external file changes.
 *
 * @param content File content.
 * @returns SHA-256 hexadecimal hash.
 */
export function hashProjectCommandRules(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/**
 * Splits a simple command line into argv tokens without invoking a shell.
 *
 * @param value Command line entered by the user.
 * @returns Parsed command tokens.
 * @throws When the input contains an unterminated quote or escape.
 */
export function tokenizeCommandLine(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: "'" | '"' | null = null;
  let isEscaped = false;
  let hasToken = false;

  for (const character of value.trim()) {
    if (isEscaped) {
      current += character;
      isEscaped = false;
      hasToken = true;
      continue;
    }

    if (character === "\\" && quote !== "'") {
      isEscaped = true;
      hasToken = true;
      continue;
    }

    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      hasToken = true;
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      hasToken = true;
      continue;
    }

    if (/\s/.test(character)) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }

    current += character;
    hasToken = true;
  }

  if (isEscaped || quote !== null) {
    throw new Error("The command contains an unterminated quote or escape.");
  }

  if (hasToken) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Renders one rule declaration.
 *
 * @param rule Rule to render.
 * @returns Starlark-like rule declaration.
 */
function renderRule(rule: OpenCodexProjectCommandRule): string {
  const lines = [
    `# OpenCodexUI rule: ${formatComment(rule.name)}`,
    "prefix_rule(",
    `    pattern = ${formatStringList(rule.pattern)},`,
    `    decision = ${JSON.stringify(rule.decision)},`
  ];

  if (rule.justification !== null && rule.justification.trim().length > 0) {
    lines.push(`    justification = ${JSON.stringify(rule.justification.trim())},`);
  }

  if (rule.matchExamples.length > 0) {
    lines.push(`    match = ${formatStringList(rule.matchExamples)},`);
  }

  if (rule.notMatchExamples.length > 0) {
    lines.push(`    not_match = ${formatStringList(rule.notMatchExamples)},`);
  }

  lines.push(")");
  return lines.join("\n");
}

/**
 * Formats a string list using stable one-line JSON syntax.
 *
 * @param values Strings to format.
 * @returns JSON-compatible list syntax.
 */
function formatStringList(values: string[]): string {
  return `[${values.map((value) => JSON.stringify(value)).join(", ")}]`;
}

/**
 * Keeps generated comments on one line.
 *
 * @param value User-defined rule name.
 * @returns Safe comment text.
 */
function formatComment(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}
