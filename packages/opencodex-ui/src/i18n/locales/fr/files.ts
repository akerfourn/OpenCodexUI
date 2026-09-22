export const frFiles = {
  files: {
    openingMode: "Ouvrir les liens de fichiers avec",
    openingIntegrated: "OpenCodexUI (éditeur intégré)",
    openingExternal: "L’application configurée dans la source",
    openingDescription: "Ce choix s’applique aux liens dans les chats et le panneau Git. Les fichiers hors du workspace utilisent l’application externe. L’explorateur Fichiers ouvre toujours l’éditeur intégré.",
    openingSaveError: "Impossible d’enregistrer ce choix. Le réglage précédent est conservé.",

    viewerFailed:
      "L’éditeur ne peut pas être chargé. Votre contenu reste disponible pour être copié ou sauvegardé.",
    title: "Fichiers",
    documents: "Documents ouverts",
    chat: "Revenir à la conversation",
    close: "Fermer {{name}}",
    save: "Sauvegarder",
    reload: "Recharger depuis le disque",
    refresh: "Actualiser l’arborescence",
    retry: "Réessayer",
    external: "Ouvrir avec une application externe",
    emptyFolder: "Dossier vide",
    showMore: "Afficher la suite",
    noWorkspace: "Sélectionnez un workspace pour parcourir ses fichiers.",
    sourceUnavailable: "La source est indisponible. Les documents déjà ouverts restent consultables.",
    readOnly: "Lecture seule",
    mixedEol:
      "Ce fichier utilise des fins de ligne mixtes. Il reste en lecture seule pour préserver son format.",
    conflict:
      "Ce fichier a changé sur le disque. Vos modifications sont conservées. Rechargez explicitement le fichier pour résoudre le conflit, ou gardez-le ouvert pour examiner et copier votre contenu.",
    details: "Détails techniques",
    unsavedTitle: "Modifications non sauvegardées",
    unsavedDescription:
      "Sauvegarder ces documents avant de continuer ? En cas d’erreur, leur contenu sera conservé.",
    discard: "Abandonner les modifications",
    errors: {
      unavailable:
        "Impossible d’accéder à cette source. Les sources distantes nécessitent Node.js et l’API process de Codex.",
      inaccessible: "Le fichier est inaccessible ou a été supprimé. Le contenu déjà ouvert est conservé.",
      symlink: "Les liens symboliques sont visibles mais ne sont pas ouverts dans cette version.",
      tooLarge: "Limite atteinte : fichiers de 2 Mio maximum et dossiers de 10 000 entrées maximum.",
      binary: "Ce fichier n’est pas un fichier texte pris en charge.",
      encoding: "Seuls les fichiers texte UTF-8, avec ou sans BOM, peuvent être modifiés.",
      conflict: "Le fichier a changé sur le disque. Aucun écrasement n’a été effectué.",
      readOnly: "Ce fichier est en lecture seule.",
      invalidPath: "Ce chemin n’est pas autorisé dans le workspace sélectionné."
    }
  }
} as const;
