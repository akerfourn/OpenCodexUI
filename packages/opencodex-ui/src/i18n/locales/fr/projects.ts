/**
 * French translations for the projects UI domain.
 */
export const frProjects = {
  project: {
    codexSourceUnavailable: "La source Codex de ce projet est inactive. Le projet reste consultable depuis le cache local.",
    orphanSource: "Ce projet n'est plus associe a une source Codex. Il est disponible en lecture seule jusqu'a une resynchronisation."
  },
  projectStatistics: {
    cachedInputTokens: "Tokens d'entrée en cache",
    chats: "Chats",
    close: "Fermer",
    coverage_one: "{{known}} sur {{count}} chat avec une consommation connue",
    coverage_many: "{{known}} sur {{count}} chats avec une consommation connue",
    coverage_other: "{{known}} sur {{count}} chats avec une consommation connue",
    description: "Consommation des chats présents dans le cache, chats actifs et archivés inclus.",
    empty: "Aucun chat n'est présent dans le cache pour ce projet.",
    inputTokens: "Tokens d'entrée",
    loadError: "Impossible de charger les statistiques du projet.",
    loading: "Chargement des statistiques...",
    outputTokens: "Tokens de sortie",
    reasoningTokens: "Tokens de raisonnement",
    title: "Statistiques du projet",
    totalTokens: "Total de tokens",
    unknownChats_one: "La consommation de {{count}} chat n'est pas connue et n'est pas incluse dans le total.",
    unknownChats_many: "La consommation de {{count}} chats n'est pas connue et n'est pas incluse dans le total.",
    unknownChats_other: "La consommation de {{count}} chats n'est pas connue et n'est pas incluse dans le total."
  },
  projectTools: {
    closePanel: "Réduire le panneau d'outils",
    commands: "Commandes",
    context: "Dossiers de contexte",
    git: "Git",
    openPanel: "Ouvrir le panneau d'outils",
    rules: "Autorisations",
    tasks: "Tâches",
    tabs: "Outils du projet"
  },
  contextFolders: {
    actions: "Actions du dossier",
    add: "Ajouter",
    addDescription:
      "Sélectionnez un dossier local ou saisissez un chemin manuellement pour les sources distantes ou non natives.",
    addManualPath: "Ajouter ce chemin",
    addTitle: "Ajouter un dossier de contexte",
    cancel: "Annuler",
    delete: "Supprimer",
    deleteDescription: "Supprimer le dossier de contexte \"{{name}}\" ? La configuration Codex devra être resynchronisée.",
    deleteTitle: "Supprimer ce dossier ?",
    description: "Ajoutez des dossiers que Codex pourra lire en plus du projet courant.",
    empty: "Aucun dossier externe configuré.",
    lastSynced: "Synchronisé le {{date}}",
    manualPath: "Chemin manuel",
    manualPathPlaceholder: "/chemin/du/dossier",
    name: "Nom affiché",
    notSynced: "Configuration non synchronisée.",
    path: "Chemin du dossier",
    pickLocalFolder: "Sélectionner un dossier local",
    rename: "Renommer",
    renameTitle: "Renommer le dossier",
    remove: "Supprimer le dossier",
    save: "Enregistrer",
    sourceUnavailable: "La source Codex du projet est inactive.",
    sync: "Synchroniser la configuration Codex",
    toggle: "Activer le dossier",
    trustRequired: "Le projet doit être marqué comme fiable pour que Codex charge .codex/config.toml."
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
} as const;
