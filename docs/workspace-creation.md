# Création de workspaces : contrat backend

Cette partie relève du lot 3 du [suivi de livraison](workspaces-delivery-plan.md).
Elle expose la création de worktrees gérés et leur récupération. La découverte
des worktrees externes est décrite dans [son contrat](workspace-discovery.md).
Le parcours GUI est décrit dans le [guide utilisateur](workspaces-user-guide.md).

## Requêtes disponibles

- `projectWorkspaces.create` reçoit `input` : `projectId`, `sourceId`,
  `name` et `start`, puis soit `destinationPath` pour un chemin personnalisé,
  soit `rootId` pour un espace configuré dans cette source. Sans ces deux
  derniers champs, son espace par défaut est utilisé. Les combiner est refusé.
  Le nom reste optionnel pour les anciens clients.
- `start` indique explicitement `newBranch` avec `branchName` et `startPoint`,
  `existingBranch` avec `branchName`, ou `detached` avec `startPoint`.
- `projectWorkspaces.list` retourne le catalogue prêt, principal et secondaires.
- `projectWorkspaces.rename` reçoit `projectId`, `workspaceId` et `name`.
  Seul un workspace secondaire disponible appartenant à ce projet est modifiable.
  Le nom contient de 1 à 100 caractères sans caractère de contrôle. Cette action
  ne modifie ni le chemin, ni les identités, ni les contextes d'exécution.
- `projectWorkspaces.creations.list` retourne les créations en attente du projet.
- `projectWorkspaces.creations.reconcile` reçoit leur `creationId`. Elle retourne
  le workspace publié ou `null` après annulation d'une préparation non envoyée.

Les données sont des DTO protocoles. La source et le chemin du projet sont
résolus depuis son workspace principal ; le renderer ne choisit pas un autre
dépôt en fournissant un chemin de départ.

## Conditions de création

- Le workspace principal appartient encore à la source demandée.
- Le projet correspond à une racine de worktree Git, pas à un sous-dossier.
- `config/read` confirme `projects[projectPath].trust_level = "trusted"` dans
  cette source. Aucun niveau de confiance n'est modifié automatiquement.
- La destination est un chemin absolu explicite, hors du checkout principal,
  dans la syntaxe de chemins de sa source. Elle ne doit pas exister.
- En mode personnalisé, son parent existe et n'est pas un lien symbolique.
- En mode automatique, l'espace et ses ancêtres existent sans lien symbolique.
  Le backend réserve l'identité du workspace et son chemin avant de créer
  `<projectId>`. Le dossier final `<workspaceId>` est laissé à Git et contient
  directement les fichiers du dépôt.
- La destination n'est ni publiée dans le cache ni déjà enregistrée par Git.
- Une branche déjà utilisée par un worktree est refusée avant la mutation.
  Une demande de nouvelle branche refuse aussi une branche existante libre.

Les chemins sont normalisés avec la syntaxe de leur source, sans résolution
sur le système de fichiers d'Electron. Les alias d'ancêtres et les variantes
propres aux sources restent dans les contrôles de chemins du lot 2 ; ces
vérifications ne prétendent pas établir une identité physique universelle.

Les hooks et filtres de checkout configurés dans Git peuvent s'exécuter :
la confiance du projet est donc exigée. Aucun script de préparation OpenCodexUI,
aucune copie de fichiers `.env`, aucun téléchargement de dépendances ni aucune
activation de confiance à destination ne sont ajoutés implicitement.

## Journal et publication

La migration 37 conserve `root_path` dans le journal des créations automatiques.
Le chemin est dérivé du véritable identifiant réservé du workspace et du projet.
Les modifications ultérieures des paramètres n'affectent pas la récupération.
Les anciens appels à chemin explicite gardent leur comportement, et les
créations interrompues antérieures conservent leur identité et leur destination.
Cela inclut les anciennes destinations avec un sous-dossier `worktree` : la
récupération utilise le chemin enregistré, sans reconstruire l'arborescence.

Les espaces sont stockés dans `settings.json` sous `workspaceRoots`, avec
`id`, `sourceId`, `label`, `path` et `isDefault`. Ils sont validés avant écriture :
identités uniques, chemins absolus, un défaut par source configurée. Les patches
sont persistés séquentiellement avant publication dans le runtime, afin qu'un
échec de sauvegarde n'active pas un nouvel emplacement seulement en mémoire.

Après initialisation des sources, le premier démarrage configure par défaut
`<userData>/workspaces` pour la source locale, sauf si elle a déjà des espaces.
La source locale préférée est celle désignée par `defaultSourceId`, sinon la
première source locale disponible. Le dossier est créé avant publication dans
les préférences. `defaultWorkspaceRootInitialized` mémorise cette initialisation
dans le même JSON : retirer ensuite cet espace reste un choix durable.
Sans source locale, aucune configuration ni création de dossier hôte n'a lieu.
Les sources locales ajoutées ultérieurement peuvent être configurées manuellement.

La migration 36 ajoute le nom au catalogue et au journal : le choix de
l'utilisateur survit à une interruption et à la publication après récupération.
Les noms des secondaires existants sont initialisés depuis leur dernier segment
de chemin, selon la syntaxe de la source. Le principal garde son libellé fixe
traduit dans l'interface. Les associations existantes restent intactes.

La migration 35 ajoute `workspace_creations`, sans modifier les workspaces
existants. La table conserve l'identité réservée, les chemins, le choix de
checkout et le résultat attendu. Elle réserve le couple source/répertoire Git
commun et la destination. Deux projets de la même source utilisant le même
répertoire commun ne peuvent pas lancer deux créations en parallèle.

| Moment | État persistant | Récupération |
| --- | --- | --- |
| Avant mutation | `preparing` | Annulation sans accès Git |
| Avant `worktree add` | `submitting`, commit et branche attendus | Pas de rejeu |
| Réponse Git réussie | Confirmation persistée | Vérifier puis publier |
| Erreur après envoi | `uncertain` | Conserver réservation et confirmation |

Un échec avant l'envoi annule la préparation. Un résultat Git inconnu reste
bloqué même si `worktree list` montre déjà une entrée : l'inscription peut
précéder la fin du checkout. Une réponse réussie non persistée reste également
incertaine. Aucune suppression de branche ou de dossier ne sert de rollback.

Après confirmation, le backend vérifie :

1. le répertoire Git commun du projet et du nouveau checkout ;
2. le chemin, le commit et la branche attendus dans la liste Git complète ;
3. un checkout non bare et non prunable ;
4. la présence du répertoire dans la source, sans lien symbolique à sa racine.

Le cache publie ensuite un workspace secondaire `managed: true` et retire le
journal dans la même transaction. Une erreur d'insertion restaure le journal.
Le workspace principal conserve son identité et son rôle. Aucun thread n'est
automatiquement déplacé vers le nouveau checkout.

Des triggers empêchent l'indexation d'adopter la destination pendant la
création, ainsi que la relocalisation ou l'orphelinage du principal réservé.
La suppression du projet ou de sa source reste bloquée pendant l'opération.

## Validation et limites de livraison

Tests : migration répétée avec données existantes, exclusion par dépôt,
isolation des sources, publication atomique, refus d'une adoption prématurée,
réponses perdues, reprise après réouverture SQLite et garde locale de récupération.
Un test crée un vrai checkout Git, interrompt la publication SQLite, rouvre le
cache et publie le même identifiant sans refaire la création.

Les événements de rafraîchissement GUI et la politique des racines par défaut
restent à implémenter. La découverte explicite des worktrees externes existe. Les requêtes
explicites de lecture permettent déjà de relire le résultat et les blocages.
La bascule des conversations existantes reste désactivée tant que le lot 2
n'a pas terminé ses contrôles de production.
