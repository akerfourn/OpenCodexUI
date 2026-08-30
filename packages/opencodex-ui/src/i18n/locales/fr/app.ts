/**
 * French translations for the app UI domain.
 */
export const frApp = {
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
  header: {
    contextUsageTooltip:
      "Contexte courant: {{used}} / {{max}} tokens utilisés ({{percent}} %). Total du thread: {{total}} tokens.",
    model: "Modèle: {{model}}",
    openProject: "Ouvrir le projet",
    reasoning: "Raisonnement: {{effort}}",
    refresh: "Rafraîchir",
    rename: "Renommer"
  },
  onboarding: {
    codexDescription: "OpenCodexUI pilote votre installation locale de Codex. L'application ne fournit pas Codex et n'utilise pas une authentification séparée.",
    codexDocs: "Documentation Codex",
    codexMissing: "Codex n'est pas détecté pour la source par défaut.",
    codexOutdated: "Cette version est trop ancienne. Vous pouvez forcer son utilisation, mais certaines actions peuvent échouer.",
    codexOutdatedStatus: "Codex est détecté en version {{version}}, mais cette version est trop ancienne.",
    codexReady: "Codex est prêt en version {{version}}.",
    codexTitle: "Codex CLI",
    finish: "Commencer",
    forceOutdatedCodex: "Forcer l'utilisation de cette version",
    gitDescription: "Git permet de suivre vos changements, préparer des enregistrements et travailler par branches depuis OpenCodexUI.",
    gitMissing: "Git n'est pas détecté sur cette machine.",
    gitOptional: "Git est recommandé pour les projets versionnés, mais vous pouvez continuer sans lui.",
    gitReady: "Git est prêt en version {{version}}.",
    gitTitle: "Git",
    refresh: "Revérifier",
    subtitle: "Vérifiez les prérequis locaux avant de commencer à travailler avec Codex.",
    title: "Bienvenue dans OpenCodexUI",
    unknownVersion: "inconnue"
  },
  language: {
    en: "English",
    fr: "Français",
    label: "Langue",
    system: "Système"
  },
  settings: {
    advancedPerformanceMonitoring: "Surveillance avancée des performances",
    advancedPerformanceMonitoringDescription: "Ajoute des détails par type d'événement aux diagnostics automatiques. Disponible uniquement en mode développeur.",
    allowOutdatedCodex: "Autoriser les versions obsolètes de Codex",
    allowOutdatedCodexDescription: "Permet d'utiliser une source Codex détectée mais plus ancienne que la version minimale supportée.",
    allowOutdatedCodexWarning: "Ce mode peut provoquer des erreurs pendant les actions Codex si l'API locale ne fournit pas les fonctionnalités attendues.",
    allowTurnSteering: "Permettre le guidage pendant la réflexion",
    allowTurnSteeringDescription: "Permet de guider l'agent pendant qu'il réfléchit, en lui fournissant de nouvelles directives sans attendre la réponse finale.",
    desktopNotifications: "Notifications de bureau",
    desktopNotificationsDescription: "Affiche des notifications locales sans enregistrer le contenu des messages.",
    desktopNotificationsTurnCompleted: "Réponses terminées",
    desktopNotificationsTurnCompletedDescription: "Notifie lorsqu'une réponse Codex est réellement terminée.",
    desktopNotificationsApprovalRequested: "Demandes d'autorisation",
    desktopNotificationsApprovalRequestedDescription: "Notifie lorsqu'une action attend votre autorisation.",
    discordRichPresence: "Afficher l'activité dans Discord",
    discordRichPresenceDescription: "Publie uniquement un statut générique dans Discord, sans nom de projet ni contenu de chat.",
    discordReconnect: "Reconnecter Discord",
    developerMode: "Mode développeur",
    developerModeDescription: "Active les actions de diagnostic avancées.",
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
    },
    openDeveloperTools: "Ouvrir la console",
    performanceMonitoring: "Surveiller les ralentissements",
    performanceMonitoringDescription: "Détecte automatiquement les ralentissements et crée un diagnostic local sans enregistrer le contenu des chats."
  },
  shutdown: {
    detail: "Arrêt des processus Codex et finalisation des données locales.",
    title: "Fermeture de l’application…"
  },
  theme: {
    dark: "Sombre",
    label: "Thème",
    light: "Clair",
    system: "Système"
  },
  tabs: {
    closeProject: "Fermer {{project}}",
    home: "Home",
    label: "Onglets de l'application"
  },
} as const;
