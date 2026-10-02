export const frBrowserPermissions = {
  browserPermissions: {
    sourceTitle: "Permissions du navigateur — source",
    chatTitle: "Permissions du navigateur — chat",
    description: "Gérez les décisions enregistrées pour le navigateur. Réinitialiser une règle permet une nouvelle demande d’autorisation. D’autres politiques Codex peuvent toujours restreindre l’accès.",
    resource: "Permission",
    resources: {
      origins: "Accès aux sites",
      downloads: "Téléchargements",
      uploads: "Envoi de fichiers",
      full_cdp: "Accès avancé au navigateur (CDP)"
    },
    inherited: "Règles globales de la source",
    precedence: "Un refus, global ou dans ce chat, est prioritaire sur une autorisation. Modifiez les règles globales depuis la carte de la source.",
    globalRules: "Décisions globales",
    chatRules: "Décisions propres à ce chat",
    empty: "Aucune décision enregistrée pour cette permission.",
    notLoaded: "Les permissions n’ont pas pu être chargées.",
    allowed: "Autorisé",
    denied: "Bloqué",
    reset: "Réinitialiser",
    add: "Ajouter",
    site: "Site ou motif",
    siteHelp: "Indiquez l’origine complète, par exemple https://pro.easyeda.com. Les motifs existants sont conservés tels quels.",
    decision: "Décision",
    decisionFor: "Décision pour {{site}}",
    refresh: "Actualiser",
    close: "Fermer",
    reload: "Recharger la connexion Codex",
    reloadNotice: "Enregistré. Le navigateur peut encore conserver l’ancienne décision en cache. Rechargez la connexion pour appliquer les changements immédiatement ; cette action est disponible lorsque les agents sont au repos.",
    errors: {
      conflict: "Le fichier a changé depuis sa lecture. Actualisez les permissions avant de réessayer.",
      busy: "Un agent travaille encore. Attendez la fin des actions avant de recharger la connexion.",
      unsupported: "Ces réglages ne sont pas accessibles pour cette source.",
      format: "Le format du fichier de permissions n’est pas compatible. Aucun réglage n’a été remplacé.",
      invalid: "La source, le chat ou la permission n’est pas valide.",
      unavailable: "Impossible de lire ou d’enregistrer les permissions du navigateur."
    }
  }
} as const;
