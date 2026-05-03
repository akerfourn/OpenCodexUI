import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import type { OpenCodexLanguage } from "@open-codex-ui/opencodex-protocol";

export type OpenCodexResolvedLanguage = Exclude<OpenCodexLanguage, "system">;

export const defaultNS = "translation";

export const resources = {
  fr: {
    translation: {
      approval: {
        accept: "Accepter",
        acceptForSession: "Accepter pour la session",
        cancel: "Annuler",
        decline: "Refuser",
        required: "Approbation requise"
      },
      chat: {
        activityInProgress: "Activité en cours",
        copyCodeBlock: "Copier le bloc de code",
        creating: "Création du chat...",
        empty: "Aucune conversation ouverte",
        loading: "Chargement du chat...",
        newConversation: "Nouvelle conversation",
        noWorkspace: "Workspace non renseigné",
        start: "Démarrer un chat",
        syncing: "Synchronisation avec Codex...",
        untitled: "Conversation sans titre"
      },
      composer: {
        interrupt: "Interrompre",
        messagePlaceholder: "Message à Codex",
        model: "Modèle",
        reasoning: "Raisonnement",
        send: "Envoyer"
      },
      header: {
        model: "Modèle: {{model}}",
        reasoning: "Raisonnement: {{effort}}",
        refresh: "Rafraîchir",
        rename: "Renommer"
      },
      language: {
        en: "English",
        fr: "Français",
        label: "Langue",
        system: "Système"
      },
      reasoningBlock: {
        active: "Réflexion en cours ({{duration}})",
        activity: "Activités",
        mixed: "Réflexion et activités",
        reasoning: "Réflexion"
      },
      rename: {
        cancel: "Annuler",
        submit: "Renommer",
        title: "Renommer le chat"
      },
      sidebar: {
        allChats: "Tous les chats",
        currentProject: "Projet courant",
        filterNotice: "Le filtrage par projet n'est pas disponible avec ce workspace.",
        filterTabs: "Filtre des conversations",
        new: "Nouveau",
        otherChats: "Autres chats",
        search: "Rechercher"
      }
    }
  },
  en: {
    translation: {
      approval: {
        accept: "Accept",
        acceptForSession: "Accept for session",
        cancel: "Cancel",
        decline: "Decline",
        required: "Approval required"
      },
      chat: {
        activityInProgress: "Activity in progress",
        copyCodeBlock: "Copy code block",
        creating: "Creating chat...",
        empty: "No conversation open",
        loading: "Loading chat...",
        newConversation: "New conversation",
        noWorkspace: "Workspace not provided",
        start: "Start a chat",
        syncing: "Syncing with Codex...",
        untitled: "Untitled conversation"
      },
      composer: {
        interrupt: "Interrupt",
        messagePlaceholder: "Message Codex",
        model: "Model",
        reasoning: "Reasoning",
        send: "Send"
      },
      header: {
        model: "Model: {{model}}",
        reasoning: "Reasoning: {{effort}}",
        refresh: "Refresh",
        rename: "Rename"
      },
      language: {
        en: "English",
        fr: "Français",
        label: "Language",
        system: "System"
      },
      reasoningBlock: {
        active: "Thinking ({{duration}})",
        activity: "Activities",
        mixed: "Thinking and activities",
        reasoning: "Thinking"
      },
      rename: {
        cancel: "Cancel",
        submit: "Rename",
        title: "Rename chat"
      },
      sidebar: {
        allChats: "All chats",
        currentProject: "Current project",
        filterNotice: "Project filtering is not available with this workspace.",
        filterTabs: "Conversation filter",
        new: "New",
        otherChats: "Other chats",
        search: "Search"
      }
    }
  }
} as const;

export function initializeOpenCodexI18n(language: OpenCodexLanguage = "system"): void {
  void i18n
    .use(initReactI18next)
    .init({
      resources,
      lng: resolveLanguage(language),
      fallbackLng: "fr",
      interpolation: {
        escapeValue: false
      }
    });
}

export function applyOpenCodexLanguage(language: OpenCodexLanguage): void {
  const nextLanguage = resolveLanguage(language);

  if (i18n.isInitialized && i18n.language !== nextLanguage) {
    void i18n.changeLanguage(nextLanguage);
  }
}

function resolveLanguage(language: OpenCodexLanguage): OpenCodexResolvedLanguage {
  if (language === "fr" || language === "en") {
    return language;
  }

  if (typeof navigator === "undefined") {
    return "fr";
  }

  const preferredLanguage = navigator.language.toLowerCase();
  return preferredLanguage.startsWith("en") ? "en" : "fr";
}
