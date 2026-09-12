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
    allTypes: "Tous les types",
    noMatching: "Aucun log ne correspond aux types sélectionnés.",
    noTypesSelected: "Aucun type",
    maxEntries: "Nombre maximal d'entrées",
    policyCategories: {
      info: "Information",
      performanceSlowdown: "Ralentissements des performances"
    },
    policyInvalidNumber: "Saisissez un nombre entier entre {{min}} et {{max}}.",
    policyMode: "Mode de stockage",
    policyModes: {
      disabled: "Désactivé",
      retained: "Historique limité",
      session: "Session uniquement",
      unlimited: "Historique illimité"
    },
    policyPersistenceNote: "L'historique limité supprime automatiquement les logs plus anciens que la durée choisie. Les modes Désactivé et Session uniquement arrêtent la persistance future et conservent l'historique déjà enregistré sur disque jusqu'au nettoyage.",
    policySaveError: "Impossible d'enregistrer les paramètres de stockage des logs.",
    policySettings: "Paramètres de stockage des logs",
    policySettingsDescription: "Choisissez la conservation des logs d'information et de ralentissement des performances. Les changements s'appliquent après l'enregistrement.",
    retentionDays: "Jours de conservation",
    savePolicies: "Enregistrer les paramètres",
    session: "Session",
    sessionTooltip: "Conservés uniquement pendant cette session de l’application ; perdus à sa fermeture.",
    selectedTypes: "{{count}} types sélectionnés",
    title: "Logs",
    typeFilter: "Types affichés",
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
