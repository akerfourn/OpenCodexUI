/**
 * French translations for the support UI domain.
 */
export const frSupport = {
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
    catalogNotLoaded: "Le catalogue distant n'est pas chargé automatiquement afin de préserver " +
      "la réactivité de l'application.",
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
    loadCatalog: "Parcourir le catalogue",
    loadMore: "Afficher plus",
    mcpServer: "Serveur MCP",
    needsAuth: "Authentification requise",
    noDescription: "Aucune description disponible.",
    noIntegrations: "Aucune intégration déclarée.",
    noSkills: "Aucun skill déclaré.",
    noSource: "Aucune source Codex disponible.",
    refresh: "Rafraîchir les plugins",
    refreshCatalog: "Mettre à jour le catalogue",
    refineSearch: "La limite d'affichage est atteinte. Affinez la recherche pour explorer " +
      "d'autres plugins.",
    search: "Rechercher des plugins",
    skills: "Skills",
    source: "Source",
    sourceUnavailable: "La source Codex sélectionnée est inactive.",
    title: "Plugins",
    uninstall: "Désinstaller"
  },
} as const;
