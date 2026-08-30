/** French translations for host Docker management. */
export const frDocker = {
  docker: {
    actions: {
      logs: "Voir les logs",
      restart: "Redémarrer",
      start: "Démarrer",
      stop: "Arrêter"
    },
    columns: {
      actions: "Actions",
      image: "Image",
      name: "Conteneur",
      ports: "Ports",
      status: "État"
    },
    containerCount_one: "{{count}} conteneur",
    containerCount_many: "{{count}} conteneurs",
    containerCount_other: "{{count}} conteneurs",
    description: "Consultez et contrôlez les conteneurs du moteur Docker local.",
    empty: "Aucun conteneur existant dans le contexte Docker actif.",
    logs: {
      close: "Fermer",
      empty: "Aucun log disponible pour ce conteneur.",
      stderr: "Sortie d’erreur",
      stdout: "Sortie standard",
      title: "Logs de {{container}}",
      truncated: "Cette sortie a été tronquée pour limiter la quantité de données affichée."
    },
    refresh: "Rafraîchir",
    serverVersion: "Docker {{version}}",
    title: "Docker local",
    unavailableTitle: "Docker n’est pas disponible"
  }
} as const;
