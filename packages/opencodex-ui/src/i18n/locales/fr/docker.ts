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
    unavailableTitle: "Docker n’est pas disponible",
    compose: {
      actions: {
        logs: "Voir les logs",
        refresh: "Rafraîchir",
        restart: "Redémarrer",
        start: "Lancer",
        stop: "Arrêter"
      },
      composeFile: "Fichier Compose : {{file}}",
      containers: "Conteneurs",
      description: "Services Docker Compose de ce projet.",
      empty: "Aucun service Compose n’a été détecté.",
      exitCode: "Code de sortie : {{code}}",
      health: "Santé",
      loading: "Détection de Docker Compose…",
      logs: {
        close: "Fermer",
        empty: "Aucun log disponible pour ce service.",
        stderr: "Sortie d’erreur",
        stdout: "Sortie standard",
        title: "Logs de {{service}}",
        truncated: "Cette sortie a été tronquée pour limiter la quantité de données affichée."
      },
      name: "Nom",
      noContainers: "Aucun conteneur",
      ports: "Ports",
      sourceUnavailable: "La source de ce projet est inactive.",
      state: "État",
      status: {
        missing: "Absent",
        partial: "Partiel",
        running: "En cours",
        stopped: "Arrêté",
        unhealthy: "Dégradé",
        unknown: "Inconnu"
      },
      title: "Docker Compose"
    }
  }
} as const;
