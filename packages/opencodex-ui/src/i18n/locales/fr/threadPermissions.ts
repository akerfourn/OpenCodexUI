export const frThreadPermissions = {
  threadPermissions: {
    button: "Permissions",
    title: "Permissions de ce chat",
    description: "Consultez les permissions réellement appliquées à cette conversation par Codex.",
    filesystem: "Accès aux fichiers",
    readOnly: "Lecture seule",
    workspaceWrite: "Écriture dans le workspace",
    network: "Autoriser l’accès au réseau",
    managedNetwork: "L’accès au réseau est géré par le profil personnalisé.",
    saved: "Les permissions de ce chat ont été appliquées et confirmées par Codex.",
    reviewer: "Traitement des demandes d’autorisation",
    manual: "Me demander",
    automatic: "Revue automatique",
    custom: "Personnalisé",
    onRequest: "Autorisation demandée si un accès supplémentaire est nécessaire",
    never: "Aucune demande d’autorisation",
    policy: "Politique conservée : {{policy}}.",
    profile: "Profil actif : {{name}}",
    workspace: "Workspace : {{path}}",
    protectedProfile: "Ce chat utilise un profil personnalisé ou un workspace isolé. Ses accès sont conservés ; seul le traitement des demandes peut être modifié ici.",
    scope: "Les changements concernent les prochains messages de ce chat. L’historique est conservé. La revue automatique peut refuser une action ; les restrictions de Codex restent applicables.",
    waitForIdle: "Attendez la fin des opérations en cours avant de gérer les permissions.",
    loading: "Lecture ou application des permissions",
    refresh: "Actualiser",
    close: "Fermer",
    apply: "Appliquer"
  }
} as const;
