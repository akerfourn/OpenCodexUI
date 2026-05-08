/**
 * Configures translations and runtime language switching for the OpenCodex UI.
 */
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
        command: "Commande",
        commandDescription: "Codex souhaite exécuter cette commande.",
        copyRaw: "Copier les détails techniques",
        cwd: "Dossier d'exécution",
        decline: "Refuser",
        fileChange: "Modification de fichiers",
        fileChangeDescription: "Codex demande l'autorisation de modifier des fichiers dans ce périmètre.",
        grantRoot: "Périmètre autorisé",
        other: "Demande Codex",
        otherDescription: "Codex demande une approbation pour continuer.",
        permissions: "Permissions",
        permissionsDescription: "Codex demande des permissions supplémentaires pour continuer.",
        rawDetails: "Détails techniques",
        reason: "Raison",
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
        recovering: "Reconnexion à Codex...",
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
      closeProject: {
        cancel: "Annuler",
        confirmCheckbox: "Je confirme que je veux fermer ce projet",
        description: "Les chats chargés de ce projet seront libérés de la mémoire. Le cache local reste conservé.",
        runningTurn: "Un turn est encore actif dans ce projet. Interrompez-le avant de fermer l'onglet.",
        submit: "Fermer le projet",
        title: "Fermer {{project}} ?"
      },
      home: {
        createPath: "Créer/Ouvrir",
        noRecentProjects: "Aucun projet récent pour le moment.",
        openPath: "Ouvrir",
        openProject: "Ouvrir un projet",
        openProjectDescription: "Sélectionnez un dossier de travail pour ouvrir ses chats dans un onglet projet.",
        pickExisting: "Ouvrir un dossier",
        pickNew: "Nouveau dossier",
        projectPath: "Chemin du projet",
        projectPathPlaceholder: "/home/adrien/projet",
        projects: "Projets",
        recentProjects: "Projets récents",
        refreshProjects: "Synchroniser les projets récents",
        settings: "Paramètres"
      },
      language: {
        en: "English",
        fr: "Français",
        label: "Langue",
        system: "Système"
      },
      message: {
        copied: "Copié",
        copy: "Copier le message"
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
      trustProject: {
        cancel: "Plus tard",
        confirmCheckbox: "Je fais confiance au contenu local de ce projet",
        description: "Codex a désactivé la configuration locale, les hooks et les politiques d'exécution de ce projet tant qu'il n'est pas marqué comme fiable.",
        foldersLabel: "Dossiers concernés",
        submit: "Faire confiance au projet",
        title: "Faire confiance à ce projet ?",
        warning: "N'acceptez que si vous faites confiance aux fichiers de ce dépôt, en particulier au dossier .codex."
      },
      sidebar: {
        allChats: "Tous les chats",
        currentProject: "Projet courant",
        filterNotice: "Le filtrage par projet n'est pas disponible avec ce workspace.",
        filterTabs: "Filtre des conversations",
        new: "Nouveau",
        openNewChat: "Ouvrir un nouveau chat",
        otherChats: "Autres chats",
        refresh: "Synchroniser les chats",
        search: "Rechercher"
      },
      tabs: {
        closeProject: "Fermer {{project}}",
        home: "Home",
        label: "Onglets de l'application"
      }
    }
  },
  en: {
    translation: {
      approval: {
        accept: "Accept",
        acceptForSession: "Accept for session",
        cancel: "Cancel",
        command: "Command",
        commandDescription: "Codex wants to run this command.",
        copyRaw: "Copy technical details",
        cwd: "Working directory",
        decline: "Decline",
        fileChange: "File changes",
        fileChangeDescription: "Codex is asking to modify files within this scope.",
        grantRoot: "Allowed scope",
        other: "Codex request",
        otherDescription: "Codex is asking for approval to continue.",
        permissions: "Permissions",
        permissionsDescription: "Codex is asking for additional permissions to continue.",
        rawDetails: "Technical details",
        reason: "Reason",
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
        recovering: "Reconnecting to Codex...",
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
      closeProject: {
        cancel: "Cancel",
        confirmCheckbox: "I confirm I want to close this project",
        description: "Loaded chats for this project will be released from memory. The local cache is kept.",
        runningTurn: "A turn is still active in this project. Interrupt it before closing the tab.",
        submit: "Close project",
        title: "Close {{project}}?"
      },
      home: {
        createPath: "Create/Open",
        noRecentProjects: "No recent projects yet.",
        openPath: "Open",
        openProject: "Open a project",
        openProjectDescription: "Select a working directory to open its chats in a project tab.",
        pickExisting: "Open folder",
        pickNew: "New folder",
        projectPath: "Project path",
        projectPathPlaceholder: "/home/adrien/project",
        projects: "Projects",
        recentProjects: "Recent projects",
        refreshProjects: "Sync recent projects",
        settings: "Settings"
      },
      language: {
        en: "English",
        fr: "Français",
        label: "Language",
        system: "System"
      },
      message: {
        copied: "Copied",
        copy: "Copy message"
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
      trustProject: {
        cancel: "Later",
        confirmCheckbox: "I trust this project's local content",
        description: "Codex disabled this project's local config, hooks, and exec policies until the project is marked as trusted.",
        foldersLabel: "Affected folders",
        submit: "Trust project",
        title: "Trust this project?",
        warning: "Only accept if you trust the files in this repository, especially the .codex folder."
      },
      sidebar: {
        allChats: "All chats",
        currentProject: "Current project",
        filterNotice: "Project filtering is not available with this workspace.",
        filterTabs: "Conversation filter",
        new: "New",
        openNewChat: "Open a new chat",
        otherChats: "Other chats",
        refresh: "Sync chats",
        search: "Search"
      },
      tabs: {
        closeProject: "Close {{project}}",
        home: "Home",
        label: "Application tabs"
      }
    }
  }
} as const;

/**
 * Initializes i18n and applies the requested startup language.
 *
 * @param language Language used for localized labels.
 *
 * @returns Nothing.
 */
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

/**
 * Applies a runtime language change to the shared i18n instance.
 *
 * @param language Language used for localized labels.
 *
 * @returns Nothing.
 */
export function applyOpenCodexLanguage(language: OpenCodexLanguage): void {
  const nextLanguage = resolveLanguage(language);

  if (i18n.isInitialized && i18n.language !== nextLanguage) {
    void i18n.changeLanguage(nextLanguage);
  }
}

/**
 * Resolves the effective UI language from a protocol language setting.
 *
 * @param language Language used for localized labels.
 *
 * @returns Effective UI language.
 */
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
