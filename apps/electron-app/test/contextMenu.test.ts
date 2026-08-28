import { describe, expect, it, vi } from "vitest";

import { buildContextMenuTemplate } from "../src/main/contextMenuTemplate.js";
import { resolveContextMenuLanguage } from "../src/main/contextMenuLocale.js";

describe("context menu template", () => {
  it("should_put_spelling_suggestions_before_editing_actions", () => {
    const contents = createContents();
    const template = buildContextMenuTemplate(
      createParams({
        dictionarySuggestions: ["bonjour", "bon jour", "bonjour"],
        misspelledWord: "bonjor"
      }),
      contents
    );

    expect(template.map((item) => item.label ?? item.role ?? item.type)).toEqual([
      "bonjour",
      "bon jour",
      "separator",
      "Annuler",
      "Rétablir",
      "separator",
      "Couper",
      "Copier",
      "Coller",
      "Supprimer",
      "separator",
      "Tout sélectionner"
    ]);

    const suggestion = template[0];
    suggestion?.click?.(undefined as never, undefined, undefined as never);

    expect(contents.replaceMisspelling).toHaveBeenCalledOnce();
    expect(contents.replaceMisspelling).toHaveBeenCalledWith("bonjour");
  });

  it("should_disable_unavailable_editing_actions", () => {
    const template = buildContextMenuTemplate(
      createParams({
        editFlags: {
          canCopy: true,
          canCut: false,
          canDelete: false,
          canEditRichly: false,
          canPaste: false,
          canRedo: false,
          canSelectAll: true,
          canUndo: true
        }
      }),
      createContents(),
      { language: "en", iconForRole: (role) => `icon:${role}` }
    );

    expect(template.filter((item) => item.role !== undefined).map((item) => ({
      enabled: item.enabled,
      icon: item.icon,
      label: item.label,
      role: item.role
    }))).toEqual([
      { enabled: true, icon: "icon:undo", label: "Undo", role: "undo" },
      { enabled: false, icon: "icon:redo", label: "Redo", role: "redo" },
      { enabled: false, icon: "icon:cut", label: "Cut", role: "cut" },
      { enabled: true, icon: "icon:copy", label: "Copy", role: "copy" },
      { enabled: false, icon: "icon:paste", label: "Paste", role: "paste" },
      { enabled: false, icon: "icon:delete", label: "Delete", role: "delete" },
      { enabled: true, icon: "icon:selectAll", label: "Select all", role: "selectAll" }
    ]);
  });

  it("should_offer_copy_only_for_a_non_editable_selection", () => {
    const template = buildContextMenuTemplate(
      createParams({
        editFlags: {
          canCopy: true,
          canCut: false,
          canDelete: false,
          canEditRichly: false,
          canPaste: false,
          canRedo: false,
          canSelectAll: false,
          canUndo: false
        },
        isEditable: false,
        selectionText: "selected text"
      }),
      createContents()
    );

    expect(template).toEqual([
      { enabled: true, label: "Copier", role: "copy" }
    ]);
  });

  it("should_resolve_system_language_from_the_electron_locale", () => {
    expect(resolveContextMenuLanguage("system", "fr-FR")).toBe("fr");
    expect(resolveContextMenuLanguage("system", "en-US")).toBe("en");
    expect(resolveContextMenuLanguage("fr", "en-US")).toBe("fr");
  });
});

function createContents() {
  return {
    copy: vi.fn(),
    cut: vi.fn(),
    delete: vi.fn(),
    isDestroyed: vi.fn(() => false),
    paste: vi.fn(),
    redo: vi.fn(),
    replaceMisspelling: vi.fn(),
    selectAll: vi.fn(),
    undo: vi.fn()
  };
}

function createParams(overrides: Partial<{
  dictionarySuggestions: string[];
  editFlags: {
    canCopy: boolean;
    canCut: boolean;
    canDelete: boolean;
    canEditRichly: boolean;
    canPaste: boolean;
    canRedo: boolean;
    canSelectAll: boolean;
    canUndo: boolean;
  };
  isEditable: boolean;
  misspelledWord: string;
  selectionText: string;
}> = {}) {
  return {
    dictionarySuggestions: [],
    editFlags: {
      canCopy: true,
      canCut: true,
      canDelete: true,
      canEditRichly: true,
      canPaste: true,
      canRedo: true,
      canSelectAll: true,
      canUndo: true
    },
    isEditable: true,
    misspelledWord: "",
    selectionText: "",
    ...overrides
  };
}
