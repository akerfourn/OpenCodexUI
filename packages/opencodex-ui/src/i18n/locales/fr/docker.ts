/** French translations for host Docker management. */
export const frDocker = {
  docker: {
    availability: {
      close: "Fermer",
      explain: "Comprendre l’état : {{status}}",
      recheck: "Revérifier",
      host: "Cette vérification concerne le Docker de l’ordinateur qui exécute OpenCodexUI et son contexte Docker actif.",
      source: "Cette vérification concerne l’environnement de la source du projet. Une installation sur l’ordinateur hôte ne suffit pas nécessairement pour une source WSL ou SSH.",
      pollingPaused: "Le rafraîchissement automatique est suspendu. Après avoir corrigé la situation, cliquez sur Revérifier pour reprendre.",
      "cli-missing": {
        title: "Docker introuvable",
        description: "La commande Docker n’a pas été trouvée. Vérifiez son installation et sa présence dans le PATH de cet environnement, puis redémarrez la source si nécessaire."
      },
      "compose-missing": {
        title: "Compose indisponible",
        description: "Le plugin Docker Compose n’est pas disponible. Installez ou réparez le plugin Compose v2 dans cet environnement."
      },
      "engine-unreachable": {
        title: "Moteur Docker injoignable",
        description: "La commande Docker est présente, mais son moteur ne répond pas. Sous Windows ou macOS, vérifiez que Docker Desktop est démarré. Vérifiez aussi le service Docker et le contexte sélectionné."
      },
      "permission-denied": {
        title: "Accès Docker refusé",
        description: "Cet environnement n’a pas les droits nécessaires pour accéder à Docker. Vérifiez les autorisations d’accès au moteur Docker."
      },
      unknown: {
        title: "Docker à vérifier",
        description: "Une vérification Docker a échoué. Consultez le journal d’erreurs pour connaître l’étape concernée. Vérifiez aussi la configuration Compose du projet si le moteur fonctionne."
      }
    },
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
      fileSelection: "Fichier Compose",
      chooseFile: "Choisir un fichier Compose",
      fileMissing: "Le fichier sélectionné a disparu. Choisissez un autre fichier ; aucun remplacement automatique ne sera effectué.",
      fileSelectionHelp: "Un seul fichier est utilisé, sans fusion automatique. Les variantes d’un même dossier peuvent partager leurs conteneurs et volumes.",

      actions: {
        logs: "Voir les logs",
        refresh: "Rafraîchir",
        restart: "Redémarrer",
        start: "Lancer",
        stop: "Arrêter"
      },
      closeDetails: "Fermer les détails",
      composeFile: "Fichier Compose : {{file}}",
      containerCount_one: "{{count}} conteneur",
      containerCount_other: "{{count}} conteneurs",
      containerState: {
        created: "Créé",
        dead: "Inactif",
        exited: "Arrêté",
        paused: "En pause",
        removing: "Suppression en cours",
        restarting: "Redémarrage en cours",
        running: "En cours"
      },
      containers: "Conteneurs",
      description: "Services Docker Compose de ce projet.",
      empty: "Aucun service Compose n’a été détecté.",
      exitCode: "Code de sortie : {{code}}",
      exitCodeLabel: "Code de sortie",
      health: "Santé",
      healthStatus: {
        healthy: "Sain",
        starting: "Démarrage en cours",
        unhealthy: "Dégradé"
      },
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
      noPublishedPorts: "Aucun port publié",
      ports: "Ports",
      serviceDetails: "Détails du service Docker Compose",
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
