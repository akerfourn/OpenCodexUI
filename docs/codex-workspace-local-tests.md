# Essais locaux de transition de workspace

## Complément : préparation applicative des permissions

Les services `WorkspacePermissionPreparation` et `WorkspaceThreadTransition`
ont été exécutés ensemble contre le vrai app-server 0.153.4 sous Linux.
La fixture fournit une réservation et des préférences synthétiques ; ce test
ne couvrait pas le coordinateur de production. Le scénario complet figure
dans la dernière section de ce document.

Le scénario crée un thread dans A, prépare le profil de B avec un dossier
partagé autorisé en écriture et ses fichiers `*.env` interdits, reprend le même
thread dans B, puis exécute les outils demandés par un fournisseur simulé.

Résultats vérifiés par assertions :

- le profil identifié par son contenu est chargé par `config/read` ;
- le sandbox retourné après reprise correspond à la projection attendue ;
- le fichier demandé dans B est créé ;
- le fichier demandé dans le dossier partagé est créé ;
- le fichier demandé dans A n'est pas créé : système de fichiers en lecture
  seule ;
- le contenu synthétique du fichier partagé `config.env` n'est pas retourné :
  permission refusée.

`config/read` ajoute des champs optionnels à `null` pour le réseau et la
profondeur des globs. La comparaison tolère uniquement les champs connus
absents ; des valeurs explicites ou des règles supplémentaires restent refusées.

Artefacts temporaires : `/tmp/workspace-policy-live-V2WEko`.
Script : `/tmp/workspace-permission-live.ts`, lancé avec le `vite-node` local.
Trois requêtes au fournisseur simulé, aucun appel LLM. Le fichier `.env`
contient uniquement une chaîne de test, sans secret réel.

Ce contrôle isolé complète les essais initiaux ci-dessous. Il ne couvre pas
les alias de chemins par liens symboliques, les processus survivants, les
clients multiples, ni le raccordement de la politique d'approbation réelle.

## Essais initiaux

Date : 6 septembre 2026. Binaire : Codex CLI 0.153.4, Linux.

## Environnement

Le vrai `codex app-server --stdio` est lancé avec un `CODEX_HOME` temporaire,
sans copie des identifiants ni de la configuration personnelle. Un serveur
HTTP sur `127.0.0.1` remplace le fournisseur de modèle et renvoie des événements
Responses prédéfinis. Codex exécute réellement les outils demandés.

Aucun appel LLM : zéro token facturé. Le nom `gpt-5.6-luna` est envoyé au
fournisseur simulé ; cela ne vérifie pas la disponibilité réelle de Luna.

Deux dossiers A et B contiennent chacun un AGENTS.md distinct et un profil
`probe` qui étend `:workspace`, avec une racine absolue propre au dossier.
Cela reproduit la structure pertinente du profil généré par OpenCodexUI,
sans appeler son générateur ni tester ses règles de dossiers externes.

Pour les essais d'écriture, les droits généraux sur `:tmpdir` et `:slash_tmp`
sont ramenés à la lecture. Sans cette adaptation du montage de test, placer
A et B sous `/tmp` empêcherait de mesurer leur isolation en écriture.

## Résultats observés

| Scénario | Résultat |
| --- | --- |
| Démarrage dans A et premier tour | Cwd et racines dans A |
| Reprise vers B pendant que le client reste abonné | Cwd toujours dans A |
| Tour avec `cwd=B` | Cwd dans B, marqueur AGENTS de B dans la requête |
| Permissions après ce seul changement de cwd | A reste une racine writable |
| Désabonnement, puis reprise explicite dans B | A disparaît des racines writable |
| Outil `touch B/allowed` après cette reprise | Fichier créé |
| Outil `touch A/forbidden` après cette reprise | Refus : Read-only file system |
| Arrêt du serveur et déplacement de B vers MOVED | B n'existe plus |
| Reprise explicite dans MOVED | Cwd et profil attendus retournés |
| Tour avec `cwd=MOVED`, outil `pwd` | Exécution réelle dans MOVED |
| Second redémarrage, reprise sans cwd explicite | MOVED et profil conservés |

Le même identifiant de thread est utilisé pour toutes ces opérations.
Les assertions vérifient aussi l'existence du fichier autorisé et l'absence
du fichier interdit, indépendamment du texte retourné par l'outil.

Le test AGENTS recherche le marqueur B dans la requête au fournisseur simulé.
Il ne mesure pas l'obéissance d'un modèle réel à ces instructions.

## Échec instructif du premier essai

Dans un premier parcours, la reprise explicite dans MOVED était suivie d'un
tour sans override de cwd. Après redémarrage, Codex retournait B et le profil
intégré `:workspace`, alors que B avait disparu.

Le parcours avec `cwd=MOVED` explicitement fourni au tour a ensuite passé le
contrôle de persistance, puis l'a repassé avec le test d'écriture ajouté.
Les parcours diffèrent aussi par l'ajout de l'outil `pwd` : ces essais ne
constituent pas une isolation exhaustive de la cause interne du défaut.

Conséquence pratique : une reprise réussie ne suffit pas à certifier la
persistance du nouvel emplacement. Continuer à transmettre le contexte
autoritaire d'OpenCodexUI sur les tours et les reprises ; ne pas dépendre
uniquement du chemin restauré par Codex.

## Procédure validée dans ce montage

1. Attendre la fin du tour et empêcher de nouvelles actions concurrentes.
2. Préparer la configuration et la confiance du dossier de destination.
3. Envoyer `thread/unsubscribe` pour le thread inactif.
4. Envoyer `thread/resume` avec le même `threadId`, `cwd`,
   `runtimeWorkspaceRoots`, `permissions` et `excludeTurns: true`.
5. Contrôler les paramètres retournés, notamment les anciennes racines.
6. Fournir le nouveau `cwd` explicitement sur le prochain `turn/start`.

Attention : `thread/unsubscribe` n'est pas une commande de déchargement
inconditionnel. Dans ce test avec un seul client, la reprise suivante recharge
la configuration. Un autre abonné peut empêcher ce comportement ; il faut
alors refuser une transition non vérifiée, pas la considérer comme réussie.
Il reste aussi à tester une reprise avec des paramètres identiques mais une
configuration de fichier modifiée.

Pour le déplacement, le serveur de test est arrêté avant le renommage.
Le chemin absolu dans le profil est remplacé et le nouveau dossier est déclaré
de confiance avant la reprise. Ce test ne valide pas un déplacement à chaud.

## Reproduction et limites

Script expérimental local : `/tmp/workspace-probe/probe.py`.
Commande : `python3 /tmp/workspace-probe/probe.py`.
Il nécessite l'ouverture d'un port localhost et crée un nouveau dossier
temporaire à chaque lancement. Il n'est pas intégré à la suite de tests.

Exécution finale réussie :
`/tmp/workspace-probe/1788704312592443486`.
Les requêtes simulées sont conservées dans `requests.json`, les diagnostics
app-server dans `stderr-*.log`. Ces artefacts temporaires ne sont pas versionnés.
Cette exécution utilise six requêtes au serveur simulé et aucun service LLM.

Restent hors couverture : Windows, macOS, WSL, sources distantes, plusieurs
clients, processus persistants, sous-agents, reprise après interruption au
milieu de la transition, règles externes et comportement d'un modèle réel.

Conclusion : une procédure fonctionnelle est démontrée pour le cas local
inactif à client unique. Ce résultat permet d'implémenter la transition dans
OpenCodexUI avec contrôles explicites ; il ne valide pas encore tous les cas
de cycle de vie nécessaires à une suppression ou un déplacement en production.

## Coordinateur de production et interface — 6 septembre 2026

Le scénario local final utilise SQLite réel et les classes
`WorkspaceRuntimePreparation` et `WorkspaceExecutionService`, avec Codex
0.153.4 et un fournisseur HTTP simulé. Il vérifie :

- création directe d'un thread dans B après préparation des permissions ;
- écriture dans B et dans le dossier partagé autorisé ;
- refus d'écriture dans A et de lecture du fichier `.env` exclu ;
- perte simulée de la réponse après acceptation de la bascule vers A ;
- conservation de l'association B et d'une transition `uncertain` dans SQLite ;
- fermeture et réouverture du cache, puis réconciliation vers A ;
- tour suivant réellement exécuté dans A, avec écriture dans B refusée.

Résultat : succès, quatre échanges avec le fournisseur simulé et **zéro appel
à un LLM réel**. Artifacts temporaires :
`/tmp/workspace-policy-live-jOtcj9/`, scénario
`/tmp/workspace-coordinator-live.ts` et journal
`/tmp/workspace-coordinator-live.log`.

Le test intermédiaire d'une reprise de thread vide a échoué avec
`no rollout found`. Le parcours de création a été corrigé pour préparer la
politique avant `thread/start`, sans produire de tour artificiel.

La vérification GUI interactive a été bloquée par le refus d'autorisation
d'accès de Chrome au serveur local. Les tests de composants ne remplacent pas
cette vérification visuelle ; elle reste explicitement non effectuée.
