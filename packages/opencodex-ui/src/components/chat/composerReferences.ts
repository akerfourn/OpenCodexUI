/**
 * Provides Lexical helpers for composer file and skill references.
 */
import { $createLinkNode, $isLinkNode } from "@lexical/link";
import {
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  type LexicalNode,
  type NodeKey
} from "lexical";

import type {
  OpenCodexComposerReference,
  OpenCodexFileSearchResult,
  OpenCodexSkillSearchResult
} from "@open-codex-ui/opencodex-protocol";

export type ComposerReferenceSuggestion =
  | { type: "file"; result: OpenCodexFileSearchResult }
  | { type: "skill"; result: OpenCodexSkillSearchResult };

/**
 * Composer trigger kind supported by autocomplete.
 */
export type ReferenceTriggerKind = "file" | "skill";

/**
 * Current autocomplete trigger selection inside the Lexical editor.
 */
export type ReferenceTriggerState = {
  kind: ReferenceTriggerKind;
  nodeKey: NodeKey;
  startOffset: number;
  endOffset: number;
  query: string;
};

/**
 * Serializes the Lexical composer content to Markdown and protocol references.
 *
 * @returns Markdown text and deduplicated structured references.
 */
export function serializeComposerContent(): {
  markdown: string;
  references: OpenCodexComposerReference[];
} {
  const references: OpenCodexComposerReference[] = [];
  const markdown = $getRootChildren().map((node) => (
    serializeNode(node, references)
  )).join("\n");

  return {
    markdown,
    references: deduplicateReferences(references)
  };
}

/**
 * Reads the active file or skill trigger at the collapsed selection.
 *
 * @returns Trigger state, or `null` when no reference query is active.
 */
export function readReferenceTrigger(): ReferenceTriggerState | null {
  const selection = $getSelection();

  if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
    return null;
  }

  const anchor = selection.anchor;
  const node = anchor.getNode();

  if (!$isTextNode(node)) {
    return null;
  }

  const text = node.getTextContent();
  const cursorOffset = anchor.offset;
  const beforeCursor = text.slice(0, cursorOffset);
  const startOffset = Math.max(
    beforeCursor.lastIndexOf("@"),
    beforeCursor.lastIndexOf("$")
  );

  if (startOffset < 0) {
    return null;
  }

  if (startOffset > 0 && !/\s/.test(beforeCursor[startOffset - 1] ?? "")) {
    return null;
  }

  const triggerCharacter = beforeCursor[startOffset];
  const query = beforeCursor.slice(startOffset + 1);

  if (query.includes("\n")) {
    return null;
  }

  return {
    kind: triggerCharacter === "$" ? "skill" : "file",
    nodeKey: node.getKey(),
    startOffset,
    endOffset: cursorOffset,
    query: query.trim()
  };
}

/**
 * Creates a stable key for one autocomplete trigger state.
 *
 * @param trigger Trigger state.
 * @returns Key suitable for effect dependencies and caching.
 */
export function createTriggerKey(trigger: ReferenceTriggerState): string {
  return `${trigger.kind}:${trigger.nodeKey}:${trigger.startOffset}:${trigger.query}`;
}

/**
 * Replaces the active trigger text with a tokenized reference link.
 *
 * @param node Text node containing the trigger.
 * @param trigger Trigger range to replace.
 * @param suggestion Selected reference suggestion.
 */
export function replaceTriggerWithReferenceLink(
  node: LexicalNode,
  trigger: ReferenceTriggerState,
  suggestion: ComposerReferenceSuggestion
): void {
  if (!$isTextNode(node)) {
    return;
  }

  const text = node.getTextContent();
  const before = text.slice(0, trigger.startOffset);
  const after = text.slice(trigger.endOffset);
  const link = createReferenceLinkNode(suggestion);
  const trailingText = after.startsWith(" ") ? after : ` ${after}`;
  const trailingNode = $createTextNode(trailingText);

  link.append($createTextNode(readReferenceLabel(suggestion)).setMode("token"));

  if (before.length > 0) {
    node.setTextContent(before);
    node.insertAfter(link);
  } else {
    node.replace(link);
  }

  link.insertAfter(trailingNode);
  trailingNode.select(1, 1);
}

/**
 * Converts file-search results to composer suggestions.
 *
 * @param results File-search results.
 * @returns Composer suggestions.
 */
export function mapFileSuggestions(results: OpenCodexFileSearchResult[]): ComposerReferenceSuggestion[] {
  return results.map((result) => ({ type: "file", result }));
}

/**
 * Converts skill-search results to composer suggestions.
 *
 * @param results Skill-search results.
 * @returns Composer suggestions.
 */
export function mapSkillSuggestions(results: OpenCodexSkillSearchResult[]): ComposerReferenceSuggestion[] {
  return results.map((result) => ({ type: "skill", result }));
}

/**
 * Checks whether a link URL encodes an OpenCodex skill reference.
 *
 * @param url Link URL.
 * @returns Whether the URL is a skill reference URL.
 */
export function isSkillUrl(url: string): boolean {
  return url.startsWith("opencodex-skill:");
}

/**
 * Reads root children from the active Lexical editor state.
 *
 * @returns Root child nodes.
 */
function $getRootChildren(): LexicalNode[] {
  return $getRoot().getChildren();
}

/**
 * Serializes a Lexical node to Markdown.
 *
 * @param node Node to serialize.
 * @param references Mutable reference accumulator.
 * @returns Markdown fragment.
 */
function serializeNode(node: LexicalNode, references: OpenCodexComposerReference[]): string {
  if ($isLinkNode(node)) {
    const text = node.getChildren().map((child) => serializeNode(child, references)).join("");
    const skillReference = readSkillReference(node.getURL());

    if (skillReference !== null) {
      references.push(skillReference);
      return text;
    }

    return `[${text}](${node.getURL()})`;
  }

  if ("getChildren" in node && typeof node.getChildren === "function") {
    const children = node.getChildren() as LexicalNode[];
    return children.map((child) => serializeNode(child, references)).join("");
  }

  return node.getTextContent();
}

/**
 * Creates a Lexical link node for a file or skill suggestion.
 *
 * @param suggestion Selected reference suggestion.
 * @returns Link node configured for the reference.
 */
function createReferenceLinkNode(suggestion: ComposerReferenceSuggestion): ReturnType<typeof $createLinkNode> {
  if (suggestion.type === "skill") {
    return $createLinkNode(createSkillUrl(suggestion.result), {
      rel: "opencodex-skill",
      title: suggestion.result.path
    });
  }

  return $createLinkNode(suggestion.result.relativePath, {
    title: suggestion.result.relativePath
  });
}

/**
 * Reads the inline label displayed for a suggestion.
 *
 * @param suggestion Reference suggestion.
 * @returns Inline token label.
 */
function readReferenceLabel(suggestion: ComposerReferenceSuggestion): string {
  if (suggestion.type === "skill") {
    return `$${suggestion.result.name}`;
  }

  return suggestion.result.fileName;
}

/**
 * Encodes a skill reference as an internal URL.
 *
 * @param skill Skill result.
 * @returns Internal skill URL.
 */
function createSkillUrl(skill: OpenCodexSkillSearchResult): string {
  const params = new URLSearchParams({
    name: skill.name,
    path: skill.path
  });

  return `opencodex-skill:${params.toString()}`;
}

/**
 * Decodes an internal skill URL to a protocol reference.
 *
 * @param url Internal skill URL.
 * @returns Skill reference, or `null` when invalid.
 */
function readSkillReference(url: string): OpenCodexComposerReference | null {
  if (!isSkillUrl(url)) {
    return null;
  }

  const params = new URLSearchParams(url.slice("opencodex-skill:".length));
  const name = params.get("name") ?? "";
  const path = params.get("path") ?? "";

  if (name.length === 0 || path.length === 0) {
    return null;
  }

  return {
    type: "skill",
    name,
    path
  };
}

/**
 * Removes duplicate composer references while preserving first-seen order.
 *
 * @param references Raw references collected from the editor tree.
 * @returns Deduplicated references.
 */
function deduplicateReferences(
  references: OpenCodexComposerReference[]
): OpenCodexComposerReference[] {
  const seenKeys = new Set<string>();
  const deduplicatedReferences: OpenCodexComposerReference[] = [];

  for (const reference of references) {
    const key = `${reference.type}:${reference.path}`;

    if (seenKeys.has(key)) {
      continue;
    }

    seenKeys.add(key);
    deduplicatedReferences.push(reference);
  }

  return deduplicatedReferences;
}
