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

export type ReferenceTriggerKind = "file" | "skill";

export type ReferenceTriggerState = {
  kind: ReferenceTriggerKind;
  nodeKey: NodeKey;
  startOffset: number;
  endOffset: number;
  query: string;
};

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

export function createTriggerKey(trigger: ReferenceTriggerState): string {
  return `${trigger.kind}:${trigger.nodeKey}:${trigger.startOffset}:${trigger.query}`;
}

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

export function mapFileSuggestions(results: OpenCodexFileSearchResult[]): ComposerReferenceSuggestion[] {
  return results.map((result) => ({ type: "file", result }));
}

export function mapSkillSuggestions(results: OpenCodexSkillSearchResult[]): ComposerReferenceSuggestion[] {
  return results.map((result) => ({ type: "skill", result }));
}

export function isSkillUrl(url: string): boolean {
  return url.startsWith("opencodex-skill:");
}

function $getRootChildren(): LexicalNode[] {
  return $getRoot().getChildren();
}

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

function readReferenceLabel(suggestion: ComposerReferenceSuggestion): string {
  if (suggestion.type === "skill") {
    return `$${suggestion.result.name}`;
  }

  return suggestion.result.fileName;
}

function createSkillUrl(skill: OpenCodexSkillSearchResult): string {
  const params = new URLSearchParams({
    name: skill.name,
    path: skill.path
  });

  return `opencodex-skill:${params.toString()}`;
}

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
