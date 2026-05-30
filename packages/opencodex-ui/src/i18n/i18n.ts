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
        acceptWithExecpolicyAmendment: "Accepter et autoriser {{command}}",
        applyNetworkPolicyAllow: "Autoriser {{host}}",
        applyNetworkPolicyDeny: "Bloquer {{host}}",
        availableActions: "Choix disponibles",
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
        advanced: {
          cancel: "Annuler",
          compact: "Compacter le contexte",
          compactDescription: "Codex va résumer le contexte de cette conversation pour libérer de la place dans la fenêtre de contexte. L'historique reste visible, mais le modèle travaillera ensuite depuis ce résumé.",
          compactTitle: "Compacter cette conversation ?",
          confirm: "Valider",
          open: "Actions avancées",
          review: "Lancer une review",
          reviewDescription: "Codex va analyser les changements non commités du projet et lancer une review dans cette conversation.",
          reviewTitle: "Lancer une review ?"
        },
        attachedImage: "Image jointe",
        attachImage: "Ajouter une image",
        imageIndex: "Image {{index}}",
        interrupt: "Interrompre",
        messagePlaceholder: "Message à Codex",
        model: "Modèle",
        removeAttachment: "Retirer l'image",
        reasoning: "Raisonnement",
        send: "Envoyer",
        steer: "Guider"
      },
      header: {
        contextUsageTooltip:
          "Contexte courant: {{used}} / {{max}} tokens utilisés ({{percent}} %). Total du thread: {{total}} tokens.",
        model: "Modèle: {{model}}",
        openProject: "Ouvrir le projet",
        reasoning: "Raisonnement: {{effort}}",
        refresh: "Rafraîchir",
        rename: "Renommer"
      },
      git: {
        branchSearch: "Rechercher ou créer une branche",
        branchSwitcher: "Changer de branche",
        branchSwitcherTitle: "Changer de branche",
        changed: "Modifiés",
        close: "Fermer",
        commit: "Commit",
        commitMessage: "Message de commit",
        commitsSinceTag: "{{count}} commit(s) depuis ce tag",
        createBranch: "Créer la branche « {{name}} »",
        createTag: "Créer le tag « {{name}} »",
        currentBranch: "Branche courante",
        fetchTags: "Synchroniser les tags distants",
        generateCancel: "Annuler",
        generateDialogTitle: "Générer un message de commit",
        generateInstruction: "Précision facultative",
        generateInstructionHelp: "Ajoutez une contrainte ponctuelle pour cette génération.",
        generateMessage: "Générer le message",
        generateMessageUnavailable: "Stagez au moins un fichier pour générer un message.",
        generatingMessage: "Génération...",
        initializeRepository: "Initialiser Git",
        localBranches: "Branches locales",
        noChangedFiles: "Aucun fichier modifié.",
        noBranch: "Branche inconnue",
        noBranches: "Aucune branche.",
        noRepository: "Ce projet n'est pas un dépôt Git.",
        noReferenceTag: "Aucun tag de référence",
        noStagedFiles: "Aucun fichier staged.",
        noTags: "Aucun tag.",
        pullChanges: "Récupérer {{count}} changement(s) ↓",
        pushChanges: "Envoyer {{count}} changement(s) ↑",
        refresh: "Rafraîchir l'état Git",
        remoteBranches: "Branches distantes",
        sourceUnavailable: "Les actions Git nécessitent une source Codex associée.",
        staged: "Staged",
        stageAll: "Tout stage",
        stageFile: "Stage le fichier",
        stageSelected: "Stage",
        tagSearch: "Rechercher ou créer un tag",
        tagSelector: "Choisir un tag de référence",
        tagSelectorTitle: "Tag de référence",
        simple: {
          changed: "Modifiés",
          commit: "Enregistrer",
          commitMessage: "Message d'enregistrement",
          generateMessage: "Générer le message",
          generateMessageUnavailable: "Préparez au moins un fichier pour générer un message.",
          noChangedFiles: "Aucun fichier modifié.",
          noStagedFiles: "Aucun fichier préparé.",
          staged: "Changements préparés",
          stageAll: "Tout préparer",
          stageFile: "Préparer le fichier",
          stageSelected: "Préparer",
          unstageAll: "Tout retirer",
          unstageFile: "Retirer des changements préparés",
          unstageSelected: "Retirer"
        },
        title: "Git",
        technical: {
          changed: "Modifiés",
          commit: "Commit",
          commitMessage: "Message de commit",
          generateMessage: "Générer le message",
          generateMessageUnavailable: "Stagez au moins un fichier pour générer un message.",
          noChangedFiles: "Aucun fichier modifié.",
          noStagedFiles: "Aucun fichier staged.",
          staged: "Staged",
          stageAll: "Tout stage",
          stageFile: "Stage le fichier",
          stageSelected: "Stage",
          unstageAll: "Tout retirer",
          unstageFile: "Retirer du stage",
          unstageSelected: "Retirer"
        },
        unstageAll: "Tout retirer",
        unstageFile: "Retirer du stage",
        unstageSelected: "Retirer"
      },
      commands: {
        add: "Ajouter",
        allowParallel: "Autoriser plusieurs instances en parallèle",
        cancel: "Annuler",
        closeRun: "Retirer l'instance",
        command: "Commande",
        createTitle: "Ajouter une commande",
        delete: "Supprimer",
        deleteConfirmCheckbox: "Je confirme la suppression de cette commande",
        deleteDescription: "La commande « {{name}} » sera supprimée du projet.",
        deleteRunningDisabled: "Arrêtez les instances en cours avant de supprimer cette commande.",
        deleteTitle: "Supprimer la commande ?",
        description: "Lancez des tâches dans le dossier du projet.",
        edit: "Éditer",
        editTitle: "Éditer la commande",
        empty: "Aucune commande configurée.",
        logsTitle: "Logs de la commande",
        name: "Nom",
        noLogs: "Aucun log reçu pour le moment.",
        openLogs: "Voir les logs",
        persistLogs: "Persister les logs sur disque",
        run: "Lancer",
        running: "En cours",
        save: "Enregistrer",
        sourceUnavailable: "Les commandes nécessitent une source Codex associée.",
        status: {
          exited: "Terminée",
          failed: "Échec",
          killed: "Arrêtée",
          running: "En cours"
        },
        stopRun: "Arrêter l'instance"
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
        allSources: "Toutes les sources",
        createPath: "Créer/Ouvrir",
        deleteProjectCancel: "Annuler",
        deleteProjectConfirm: "Supprimer du cache",
        deleteProjectDescription: "Cette action supprime uniquement l'entrée locale du cache OpenCodexUI. Les conversations Codex ne sont pas supprimées.",
        deleteProjectFromCache: "Supprimer du cache",
        deleteProjectTitle: "Supprimer {{project}} du cache ?",
        noProjectSearchResults: "Aucun projet ne correspond à cette recherche.",
        noRecentProjects: "Aucun projet récent pour le moment.",
        hideHiddenProjects: "Masquer les projets masques",
        hideProject: "Masquer le projet",
        openPath: "Ouvrir",
        openProject: "Ouvrir un projet",
        openProjectDescription: "Sélectionnez un dossier de travail pour ouvrir ses chats dans un onglet projet.",
        pickExisting: "Ouvrir un dossier",
        pickNew: "Nouveau dossier",
        projectPath: "Chemin du projet",
        projectPathPlaceholder: "/home/adrien/projet",
        projects: "Projets",
        commit: "Commit",
        saveChanges: "Enregistrement",
        plugins: "Plugins",
        recentProjects: "Projets récents",
        refreshProjects: "Synchroniser les projets récents",
        searchProjects: "Rechercher un projet",
        showHiddenProjects: "Afficher les projets masques",
        showProject: "Afficher le projet",
        logs: "Logs",
        sources: "Sources",
        settings: "Paramètres",
        version: "Version {{version}}"
      },
      logs: {
        applyCleanup: "Nettoyer",
        cancel: "Annuler",
        cleanup: "Nettoyer les logs",
        cleanupAll: "Tout supprimer",
        cleanupAmount: "Durée",
        cleanupMode: "Mode",
        cleanupOlderThan: "Garder les logs récents",
        cleanupUnit: "Unité",
        copy: "Copier le log",
        delete: "Supprimer le log",
        details: "Détails du log",
        empty: "Aucun log pour le moment.",
        loadMore: "Charger plus de logs",
        title: "Logs",
        types: {
          error: "Erreur",
          info: "Information",
          warning: "Avertissement"
        },
        units: {
          days: "jours",
          hours: "heures",
          months: "mois",
          weeks: "semaines"
        },
        viewLogs: "Voir les logs"
      },
      plugins: {
        categories: {
          all: "Toutes"
        },
        category: "Catégorie",
        close: "Fermer",
        description: "Explorez les plugins exposés par Codex pour la source sélectionnée.",
        empty: "Aucun plugin ne correspond aux filtres.",
        enabled: "Activé",
        experimentalNotice: "Cette intégration utilise l'API plugins expérimentale de Codex. " +
          "Les informations peuvent varier selon la version de la CLI.",
        featured: "Mis en avant",
        filter: "Type",
        filters: {
          all: "Tous les plugins",
          available: "Disponibles",
          installed: "Installés"
        },
        install: "Installer",
        installed: "Installé",
        installedByDefault: "Installé par défaut",
        integrations: "Intégrations",
        mcpServer: "Serveur MCP",
        needsAuth: "Authentification requise",
        noDescription: "Aucune description disponible.",
        noIntegrations: "Aucune intégration déclarée.",
        noSkills: "Aucun skill déclaré.",
        noSource: "Aucune source Codex disponible.",
        refresh: "Rafraîchir les plugins",
        search: "Rechercher des plugins",
        skills: "Skills",
        source: "Source",
        title: "Plugins",
        uninstall: "Désinstaller"
      },
      commitPrompt: {
        cancel: "Annuler",
        defaultModel: "Modèle par défaut",
        defaultReasoning: "Raisonnement par défaut",
        description: "Configurez le prompt utilisé pour générer les messages depuis les changements staged.",
        edit: "Éditer",
        languages: {
          en: "Anglais",
          fr: "Français"
        },
        model: "Modèle",
        outputLanguage: "Langue de sortie",
        prompt: "Prompt",
        reasoning: "Raisonnement",
        reset: "Réinitialiser",
        save: "Enregistrer",
        saving: "Enregistrement...",
        simple: {
          description: "Configurez le prompt utilisé pour générer les messages depuis les changements préparés.",
          title: "Génération d'enregistrement"
        },
        technical: {
          description: "Configurez le prompt utilisé pour générer les messages depuis les changements staged.",
          title: "Génération de commit"
        },
        title: "Génération de commit",
        usingCustom: "Prompt personnalisé stocké dans le dossier de configuration.",
        usingDefault: "Prompt par défaut embarqué."
      },
      language: {
        en: "English",
        fr: "Français",
        label: "Langue",
        system: "Système"
      },
      message: {
        attachedImage: "Image jointe",
        cancelEdit: "Annuler",
        command: "Commande",
        commandCwd: "Dossier",
        commandDetails: "Détails de la commande",
        commandDuration: "Durée",
        commandExitCode: "Code de sortie",
        commandOutput: "Résultat",
        commandOutputUnavailable: "Aucun résultat disponible.",
        commandStatus: "Statut",
        commandUnavailable: "Commande non disponible.",
        copied: "Copié",
        copy: "Copier le message",
        edit: "Éditer le message",
        editLast: "Éditer le dernier message",
        fileChangeDetails: "Détails de la modification",
        fileChangeDiff: "Diff",
        fileChangeDiffUnavailable: "Aucun diff disponible.",
        imageUnavailable: "Image manquante ou non disponible",
        openImage: "Ouvrir l'image",
        submitEdit: "Relancer",
        todayAt: "Aujourd'hui à {{time}}",
        yesterdayAt: "Hier à {{time}}"
      },
      reasoningBlock: {
        active: "Réflexion en cours ({{duration}})",
        activity: "Activités",
        mixed: "Réflexion et activités",
        reasoning: "Réflexion"
      },
      settings: {
        allowTurnSteering: "Permettre le guidage pendant la réflexion",
        allowTurnSteeringDescription: "Permet de guider l'agent pendant qu'il réfléchit, en lui fournissant de nouvelles directives sans attendre la réponse finale.",
        enterKeyBehavior: "Comportement de la touche Entrée",
        enterKeyBehaviorDescriptions: {
          newline: "Entrée ajoute toujours une nouvelle ligne. Ctrl+Entrée envoie le message.",
          send: "Entrée envoie toujours le message. Maj+Entrée ajoute une nouvelle ligne.",
          smart: "Entrée envoie si le message tient sur une seule ligne. Après une nouvelle ligne, Entrée continue d'en ajouter."
        },
        enterKeyBehaviorOptions: {
          newline: "Toujours sauter une ligne",
          send: "Toujours envoyer le message",
          smart: "Comportement intelligent"
        },
        versioningVocabulary: "Vocabulaire de versionnement",
        versioningVocabularyDescriptions: {
          simple: "Utilise des mots plus accessibles comme préparer et enregistrer.",
          technical: "Utilise le vocabulaire Git habituel comme stage, commit et staged."
        },
        versioningVocabularyOptions: {
          simple: "Simplifié",
          technical: "Technique"
        }
      },
      theme: {
        dark: "Sombre",
        label: "Thème",
        light: "Clair",
        system: "Système"
      },
      usage: {
        labels: {
          "5h": "5h",
          weekly: "Sem.",
          usage: "Usage"
        },
        tooltip: "{{label}}: {{usedPercent}} % utilisés, {{remainingPercent}} % restants. Reset: {{reset}}"
      },
      rename: {
        cancel: "Annuler",
        submit: "Renommer",
        title: "Renommer le chat"
      },
      project: {
        orphanSource: "Ce projet n'est plus associe a une source Codex. Il est disponible en lecture seule jusqu'a une resynchronisation."
      },
      projectTools: {
        commands: "Commandes",
        git: "Git",
        tabs: "Outils du projet"
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
        openProject: "Ouvrir le projet",
        otherChats: "Autres chats",
        refresh: "Synchroniser les chats",
        search: "Rechercher"
      },
      sources: {
        add: "Ajouter",
        auto: "Auto",
        cancel: "Annuler",
        command: "Chemin ou commande",
        color: "Couleur",
        colors: {
          amber: "Ambre",
          blue: "Bleu",
          indigo: "Indigo",
          orange: "Orange",
          pink: "Rose",
          purple: "Violet",
          red: "Rouge",
          teal: "Turquoise"
        },
        defaultSource: "Source par defaut",
        delete: "Supprimer",
        deleteConfirmCheckbox: "Je confirme la suppression de cette source",
        deleteDescription: "Cette source est associee a {{count}} projet(s). La supprimer rendra ces projets orphelins.",
        deleteTitle: "Supprimer la source ?",
        custom: "Chemin ou commande personnalisée",
        description: "Configurez les installations Codex utilisables par les projets locaux.",
        edit: "Editer",
        editTitle: "Editer la source",
        name: "Nom",
        orphan: "Orphelin",
        openers: "Ouverture externe",
        openersHelp: "%D: dossier du projet, %F: fichier, %R: chemin relatif, %L: ligne, %C: colonne. Exemple: code --goto %F:%L:%C",
        openersPresetVsCode: "VSCode",
        openersPresets: "Choisir un preset",
        openFileCommand: "Commande pour ouvrir un fichier",
        openFolderCommand: "Commande pour ouvrir le projet",
        pickExecutable: "Sélectionner",
        resolvedCommand: "Commande utilisée",
        source: "Source",
        save: "Enregistrer",
        sync: "Resynchroniser",
        syncAll: "Tout resynchroniser",
        title: "Sources Codex"
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
        acceptWithExecpolicyAmendment: "Accept and allow {{command}}",
        applyNetworkPolicyAllow: "Allow {{host}}",
        applyNetworkPolicyDeny: "Block {{host}}",
        availableActions: "Available choices",
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
        advanced: {
          cancel: "Cancel",
          compact: "Compact context",
          compactDescription: "Codex will summarize this conversation context to free space in the context window. The history remains visible, but the model will continue from that summary.",
          compactTitle: "Compact this conversation?",
          confirm: "Confirm",
          open: "Advanced actions",
          review: "Start review",
          reviewDescription: "Codex will inspect the project's uncommitted changes and start a review in this conversation.",
          reviewTitle: "Start a review?"
        },
        attachedImage: "Attached image",
        attachImage: "Attach image",
        imageIndex: "Image {{index}}",
        interrupt: "Interrupt",
        messagePlaceholder: "Message Codex",
        model: "Model",
        removeAttachment: "Remove image",
        reasoning: "Reasoning",
        send: "Send",
        steer: "Steer"
      },
      header: {
        contextUsageTooltip:
          "Current context: {{used}} / {{max}} tokens used ({{percent}}%). Thread total: {{total}} tokens.",
        model: "Model: {{model}}",
        openProject: "Open project",
        reasoning: "Reasoning: {{effort}}",
        refresh: "Refresh",
        rename: "Rename"
      },
      git: {
        branchSearch: "Search or create a branch",
        branchSwitcher: "Switch branch",
        branchSwitcherTitle: "Switch branch",
        changed: "Changed",
        close: "Close",
        commit: "Commit",
        commitMessage: "Commit message",
        commitsSinceTag: "{{count}} commit(s) since this tag",
        createBranch: "Create branch “{{name}}”",
        createTag: "Create tag “{{name}}”",
        currentBranch: "Current branch",
        fetchTags: "Fetch remote tags",
        generateCancel: "Cancel",
        generateDialogTitle: "Generate commit message",
        generateInstruction: "Optional instruction",
        generateInstructionHelp: "Add a one-off constraint for this generation.",
        generateMessage: "Generate message",
        generateMessageUnavailable: "Stage at least one file to generate a message.",
        generatingMessage: "Generating...",
        initializeRepository: "Initialize Git",
        localBranches: "Local branches",
        noChangedFiles: "No changed files.",
        noBranch: "Unknown branch",
        noBranches: "No branch.",
        noRepository: "This project is not a Git repository.",
        noReferenceTag: "No reference tag",
        noStagedFiles: "No staged files.",
        noTags: "No tags.",
        pullChanges: "Pull {{count}} change(s) ↓",
        pushChanges: "Push {{count}} change(s) ↑",
        refresh: "Refresh Git status",
        remoteBranches: "Remote branches",
        sourceUnavailable: "Git actions require an associated Codex source.",
        staged: "Staged",
        stageAll: "Stage all",
        stageFile: "Stage file",
        stageSelected: "Stage",
        tagSearch: "Search or create a tag",
        tagSelector: "Select reference tag",
        tagSelectorTitle: "Reference tag",
        simple: {
          changed: "Changed",
          commit: "Save",
          commitMessage: "Save message",
          generateMessage: "Generate message",
          generateMessageUnavailable: "Prepare at least one file to generate a message.",
          noChangedFiles: "No changed files.",
          noStagedFiles: "No prepared files.",
          staged: "Prepared changes",
          stageAll: "Prepare all",
          stageFile: "Prepare file",
          stageSelected: "Prepare",
          unstageAll: "Remove all",
          unstageFile: "Remove from prepared changes",
          unstageSelected: "Remove"
        },
        title: "Git",
        technical: {
          changed: "Changed",
          commit: "Commit",
          commitMessage: "Commit message",
          generateMessage: "Generate message",
          generateMessageUnavailable: "Stage at least one file to generate a message.",
          noChangedFiles: "No changed files.",
          noStagedFiles: "No staged files.",
          staged: "Staged",
          stageAll: "Stage all",
          stageFile: "Stage file",
          stageSelected: "Stage",
          unstageAll: "Unstage all",
          unstageFile: "Unstage file",
          unstageSelected: "Unstage"
        },
        unstageAll: "Unstage all",
        unstageFile: "Unstage file",
        unstageSelected: "Unstage"
      },
      commands: {
        add: "Add",
        allowParallel: "Allow parallel instances",
        cancel: "Cancel",
        closeRun: "Close instance",
        command: "Command",
        createTitle: "Add command",
        delete: "Delete",
        deleteConfirmCheckbox: "I confirm I want to delete this command",
        deleteDescription: "The command “{{name}}” will be removed from the project.",
        deleteRunningDisabled: "Stop running instances before deleting this command.",
        deleteTitle: "Delete command?",
        description: "Run tasks in the project directory.",
        edit: "Edit",
        editTitle: "Edit command",
        empty: "No command configured.",
        logsTitle: "Command logs",
        name: "Name",
        noLogs: "No logs received yet.",
        openLogs: "View logs",
        persistLogs: "Persist logs to disk",
        run: "Run",
        running: "Running",
        save: "Save",
        sourceUnavailable: "Commands require an associated Codex source.",
        status: {
          exited: "Completed",
          failed: "Failed",
          killed: "Stopped",
          running: "Running"
        },
        stopRun: "Stop instance"
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
        allSources: "All sources",
        createPath: "Create/Open",
        deleteProjectCancel: "Cancel",
        deleteProjectConfirm: "Remove from cache",
        deleteProjectDescription: "This only removes the local OpenCodexUI cache entry. Codex conversations are not deleted.",
        deleteProjectFromCache: "Remove from cache",
        deleteProjectTitle: "Remove {{project}} from cache?",
        noProjectSearchResults: "No project matches this search.",
        noRecentProjects: "No recent projects yet.",
        hideHiddenProjects: "Hide hidden projects",
        hideProject: "Hide project",
        openPath: "Open",
        openProject: "Open a project",
        openProjectDescription: "Select a working directory to open its chats in a project tab.",
        pickExisting: "Open folder",
        pickNew: "New folder",
        projectPath: "Project path",
        projectPathPlaceholder: "/home/adrien/project",
        projects: "Projects",
        commit: "Commit",
        saveChanges: "Saving",
        plugins: "Plugins",
        recentProjects: "Recent projects",
        refreshProjects: "Sync recent projects",
        searchProjects: "Search projects",
        showHiddenProjects: "Show hidden projects",
        showProject: "Show project",
        logs: "Logs",
        sources: "Sources",
        settings: "Settings",
        version: "Version {{version}}"
      },
      logs: {
        applyCleanup: "Clean",
        cancel: "Cancel",
        cleanup: "Clean logs",
        cleanupAll: "Delete everything",
        cleanupAmount: "Duration",
        cleanupMode: "Mode",
        cleanupOlderThan: "Keep recent logs",
        cleanupUnit: "Unit",
        copy: "Copy log",
        delete: "Delete log",
        details: "Log details",
        empty: "No logs yet.",
        loadMore: "Load more logs",
        title: "Logs",
        types: {
          error: "Error",
          info: "Information",
          warning: "Warning"
        },
        units: {
          days: "days",
          hours: "hours",
          months: "months",
          weeks: "weeks"
        },
        viewLogs: "View logs"
      },
      plugins: {
        categories: {
          all: "All"
        },
        category: "Category",
        close: "Close",
        description: "Explore plugins exposed by Codex for the selected source.",
        empty: "No plugin matches the current filters.",
        enabled: "Enabled",
        experimentalNotice: "This integration uses Codex's experimental plugins API. Metadata may vary across CLI versions.",
        featured: "Featured",
        filter: "Type",
        filters: {
          all: "All plugins",
          available: "Available",
          installed: "Installed"
        },
        install: "Install",
        installed: "Installed",
        installedByDefault: "Installed by default",
        integrations: "Integrations",
        mcpServer: "MCP server",
        needsAuth: "Authentication required",
        noDescription: "No description available.",
        noIntegrations: "No declared integration.",
        noSkills: "No declared skill.",
        noSource: "No Codex source available.",
        refresh: "Refresh plugins",
        search: "Search plugins",
        skills: "Skills",
        source: "Source",
        title: "Plugins",
        uninstall: "Uninstall"
      },
      commitPrompt: {
        cancel: "Cancel",
        defaultModel: "Default model",
        defaultReasoning: "Default reasoning",
        description: "Configure the prompt used to generate messages from staged changes.",
        edit: "Edit",
        languages: {
          en: "English",
          fr: "French"
        },
        model: "Model",
        outputLanguage: "Output language",
        prompt: "Prompt",
        reasoning: "Reasoning",
        reset: "Reset",
        save: "Save",
        saving: "Saving...",
        simple: {
          description: "Configure the prompt used to generate messages from prepared changes.",
          title: "Save message generation"
        },
        technical: {
          description: "Configure the prompt used to generate messages from staged changes.",
          title: "Commit generation"
        },
        title: "Commit generation",
        usingCustom: "Custom prompt stored in the settings directory.",
        usingDefault: "Embedded default prompt."
      },
      language: {
        en: "English",
        fr: "Français",
        label: "Language",
        system: "System"
      },
      message: {
        attachedImage: "Attached image",
        cancelEdit: "Cancel",
        command: "Command",
        commandCwd: "Working directory",
        commandDetails: "Command details",
        commandDuration: "Duration",
        commandExitCode: "Exit code",
        commandOutput: "Output",
        commandOutputUnavailable: "No output available.",
        commandStatus: "Status",
        commandUnavailable: "Command unavailable.",
        copied: "Copied",
        copy: "Copy message",
        edit: "Edit message",
        editLast: "Edit last message",
        fileChangeDetails: "File change details",
        fileChangeDiff: "Diff",
        fileChangeDiffUnavailable: "No diff available.",
        imageUnavailable: "Image missing or unavailable",
        openImage: "Open image",
        submitEdit: "Regenerate",
        todayAt: "Today at {{time}}",
        yesterdayAt: "Yesterday at {{time}}"
      },
      reasoningBlock: {
        active: "Thinking ({{duration}})",
        activity: "Activities",
        mixed: "Thinking and activities",
        reasoning: "Thinking"
      },
      settings: {
        allowTurnSteering: "Allow steering while thinking",
        allowTurnSteeringDescription: "Allows sending a message into the active turn while Codex is thinking.",
        enterKeyBehavior: "Enter key behavior",
        enterKeyBehaviorDescriptions: {
          newline: "Enter always inserts a new line. Ctrl+Enter sends the message.",
          send: "Enter always sends the message. Shift+Enter inserts a new line.",
          smart: "Enter sends single-line messages. After a line break, Enter keeps inserting new lines."
        },
        enterKeyBehaviorOptions: {
          newline: "Always insert a new line",
          send: "Always send the message",
          smart: "Smart behavior"
        },
        versioningVocabulary: "Versioning vocabulary",
        versioningVocabularyDescriptions: {
          simple: "Uses more accessible words like prepare and save.",
          technical: "Uses standard Git vocabulary like stage, commit, and staged."
        },
        versioningVocabularyOptions: {
          simple: "Simplified",
          technical: "Technical"
        }
      },
      theme: {
        dark: "Dark",
        label: "Theme",
        light: "Light",
        system: "System"
      },
      usage: {
        labels: {
          "5h": "5h",
          weekly: "Week",
          usage: "Usage"
        },
        tooltip: "{{label}}: {{usedPercent}}% used, {{remainingPercent}}% remaining. Reset: {{reset}}"
      },
      rename: {
        cancel: "Cancel",
        submit: "Rename",
        title: "Rename chat"
      },
      project: {
        orphanSource: "This project is no longer associated with a Codex source. It is read-only until it is resynchronized."
      },
      projectTools: {
        commands: "Commands",
        git: "Git",
        tabs: "Project tools"
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
        openProject: "Open project",
        otherChats: "Other chats",
        refresh: "Sync chats",
        search: "Search"
      },
      sources: {
        add: "Add",
        auto: "Auto",
        cancel: "Cancel",
        command: "Path or command",
        color: "Color",
        colors: {
          amber: "Amber",
          blue: "Blue",
          indigo: "Indigo",
          orange: "Orange",
          pink: "Pink",
          purple: "Purple",
          red: "Red",
          teal: "Teal"
        },
        defaultSource: "Default source",
        delete: "Delete",
        deleteConfirmCheckbox: "I confirm I want to delete this source",
        deleteDescription: "This source is associated with {{count}} project(s). Deleting it will orphan those projects.",
        deleteTitle: "Delete source?",
        custom: "Custom path or command",
        description: "Configure the Codex installations available to local projects.",
        edit: "Edit",
        editTitle: "Edit source",
        name: "Name",
        orphan: "Orphan",
        openers: "External opening",
        openersHelp: "%D: project folder, %F: file, %R: relative path, %L: line, %C: column. Example: code --goto %F:%L:%C",
        openersPresetVsCode: "VSCode",
        openersPresets: "Choose a preset",
        openFileCommand: "Open file command",
        openFolderCommand: "Open project command",
        pickExecutable: "Select",
        resolvedCommand: "Command in use",
        source: "Source",
        save: "Save",
        sync: "Resync",
        syncAll: "Resync all",
        title: "Codex sources"
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
