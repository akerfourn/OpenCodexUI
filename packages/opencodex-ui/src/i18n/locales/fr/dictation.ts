export const frDictation = {
  "dictation": {
    "title": "Dictée vocale",
    "enabled": "Activer la dictée vocale",
    "backend": "Moteur de transcription",
    "local": "Modèle local — Transformers.js",
    "codex": "Codex — expérimental",
    "codexWarning": "Ce mode transmet votre voix à OpenAI via la source Codex du chat. Il peut être indisponible avec votre connexion actuelle ou demander une clé API. Aucun basculement automatique vers une API payante. La dictée ne doit pas lancer de tâche.",
    "localDescription": "La transcription reste sur cet ordinateur. Après le téléchargement initial, elle fonctionne hors ligne. Les modèles proposés sont multilingues.",
    "model": "Modèle local",
    "singleModel": "Un seul modèle est conservé. Télécharger un autre modèle supprime le précédent ; en cas d’annulation, il faudra le télécharger à nouveau.",
    "installed": "Modèle installé : {{model}}",
    "none": "aucun",
    "download": "Télécharger le modèle",
    "remove": "Supprimer le modèle",
    "downloading": "Téléchargement et vérification du modèle…",
    "cancel": "Annuler",
    "language": "Langue de dictée",
    "automatic": "Détection automatique",
    "start": "Dicter un message",
    "stop": "Arrêter et transcrire",
    "requesting": "Accès au microphone…",
    "recording": "Enregistrement (2 min maximum)",
    "transcribing": "Transcription…",
    "failed": "La dictée n’a pas pu aboutir. Votre brouillon est conservé.",
    "details": "Détails"
  }
} as const;
