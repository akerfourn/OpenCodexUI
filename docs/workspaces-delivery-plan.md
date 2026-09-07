# Workspaces : suivi de livraison

Ce suivi remplace les comptes rendus successifs en « nouvelles étapes ».
Les cinq lots **préparatoires** sont terminés. Ils ne représentaient pas toute
la fonctionnalité : le document de conception comporte aussi des phases Git,
interface et fonctions avancées. Les lots ci-dessous suivent la livraison du
produit, sans renuméroter chaque correctif.

## Périmètre et état

| Lot | Résultat attendu | État |
| --- | --- | --- |
| 1. Socle compatible | Identités, historique, sources et outils ciblés | Terminé |
| 2. Bascule des conversations | Transition réelle vérifiée et récupérable | Terminé |
| 3. Catalogue et worktrees | Création et découverte persistées par projet | Terminé |
| 4. Interface | Workspaces nommés dans la liste des chats | Implémenté |
| 5. Validation alpha | Parcours et compatibilité | Automatisé validé ; visuel ouvert |

Les lots 2 et 3 peuvent avancer indépendamment. Le lot 4 dépend de leurs
contrats stabilisés. L'objectif inclut toujours le changement de workspace
d'une conversation existante, pas seulement les nouvelles conversations.
Une sous-tâche terminée ne signifie pas qu'un lot est terminé.

## Lot 1 — Terminé

Identités stables, workspace principal des projets existants, contexte immuable
par tour, réservations persistantes et ciblage source/workspace des outils sont
implémentés. Les appels historiques restent pris en charge.

Preuves détaillées : [contexte d'exécution](workspace-execution-context.md).

## Lot 2 — Critères de fin du backend de transition

Déjà implémenté et testé :

- reprise Codex avec contexte explicite et vérification de la réponse ;
- transition persistante protégeant les deux emplacements ;
- génération et vérification du profil de permissions de destination ;
- exclusion des tours, maintenance et mutations du catalogue concurrentes ;
- récupération des archives/restaurations vérifiées et du nettoyage d'une
  suppression dont la confirmation a été persistée ;
- caractérisation locale avec Codex réel et fournisseur simulé, sans LLM.

Contrôles raccordés en production :

- [x] Raccorder les paramètres réels d'approbation et les capacités de la source,
  sans remplacer silencieusement une politique utilisateur incompatible.
- [x] Définir et vérifier les conditions sur les processus et sous-agents actifs.
  « Thread idle » ne suffit pas à prouver l'absence de processus persistants.
- [x] Valider les chemins dans la source, y compris les alias et liens pertinents.
- [x] Installer ces contrôles dans la composition de production ; tester une
  bascule complète, son refus et sa récupération avec le même raccordement.

Une source ou une situation non prise en charge doit être refusée explicitement.
La résolution automatique de toute ambiguïté n'est pas un critère de fin :
une suppression sans confirmation reste bloquée, sans rejeu destructif.
Ce cas ne justifie pas une série ouverte de nouveaux lots préparatoires.

## Lot 3 — Catalogue et Git

- [x] Couche Git interne de lecture et création, sans forçage ni branche implicite.
- [x] Parser porcelain NUL et tests de création sur des dépôts temporaires réels.
- [x] Persister le catalogue secondaire et les opérations de création interrompues.
- [x] Distinguer worktrees gérés et découverts ; vérifier le dépôt d'appartenance.
- [x] Réserver les créations par dépôt ; récupérer les fins Git confirmées sans rejeu.
- [x] Exposer les contrats backend de création/lecture/récupération et une destination
  explicitement validée dans la source.

La création est raccordée au backend avec une destination explicite et un
projet déclaré fiable dans Codex. Le [contrat de création](workspace-creation.md)
détaille le journal, les vérifications et les limites de récupération.
La [découverte explicite](workspace-discovery.md) enregistre les worktrees
externes sans changer leur propriétaire ni fusionner des projets existants.
Le lot backend et son raccordement GUI sont implémentés dans ce périmètre. Les
hooks et filtres Git suivent la configuration du dépôt fiable lors de la création.

## Lot 4 — Interface

- [x] Groupes de conversations par workspace nommé dans la liste des chats.
- [x] Création d'un workspace nommé et bouton de nouveau chat dans chaque groupe.
- [x] Propriétés : nom persistant, chemin consultable, Principal non modifiable.
- [x] Changement de workspace depuis le menu du chat, avec confirmation.
- [x] Import des worktrees existants comme action secondaire expliquée.
- [x] Migration v36 conservant identités, associations et créations interrompues.
- [x] Espaces de stockage configurables par source dans la rubrique Workspaces.
- [x] Chemin automatique `<espace>/<projectId>/<workspaceId>`, avec
  choix d'un autre espace ou d'un chemin personnalisé.
- [x] Migration v37 figeant la racine de stockage des créations interrompues.
- [x] Badges et transition visible dans l'historique.
- [x] Git, Compose, commandes et ouvertures suivent le workspace effectif.
- [x] Ignorer les réponses devenues obsolètes après un changement rapide.
- [x] Afficher clairement les refus et opérations à réconcilier.

## Lot 5 — Critères de livraison alpha

- [x] Projet existant utilisable sans créer de workspace secondaire.
- [x] Création, nouveau chat, bascule et prochain tour dans le bon checkout.
- [x] Historique inchangé et sous-agents conservés dans leur contexte d'origine.
- [x] Reprise après interruption aux frontières Git, Codex et cache.
- [x] Typecheck, tests ciblés et suite complète ; contrôle de taille des fichiers.
- [x] Documentation des parcours et limites.
- [ ] Vérification visuelle interactive : accès Chrome au serveur local refusé.

## Fonctions avancées distinctes

Restent dans la conception, mais ne bloquent pas le premier parcours ci-dessus :

- déplacement physique et relocalisation exposés dans l'interface ;
- gestionnaire complet : suppression physique, verrouillage et nettoyage ;
- automatisation de préparation du contenu des checkouts ;
- worktree automatique par sous-agent et transfert de ses changements.

La première interface ne proposera pas une action destructive incomplète.
Ces fonctions devront être suivies séparément, sans élargir les critères de
fin des cinq lots ci-dessus en cours d'implémentation.

## Livraison du parcours complet

Le [guide utilisateur](workspaces-user-guide.md) décrit les actions visibles,
les politiques prises en charge et les refus explicites. La création d'une
conversation prépare directement sa destination : elle ne tente pas de
reprendre un thread vide, que Codex ne sait pas encore relire.

Le scénario local final associe SQLite réel, le coordinateur de production et
Codex réel à un fournisseur simulé. Il vérifie la création directe dans B,
une réponse perdue pendant la bascule vers A, la réouverture du cache et la
récupération, puis l'exécution effective dans A. Aucun LLM réel n'est appelé.

La validation visuelle interactive n'a pas pu être exécutée : l'autorisation
d'accès de Chrome au serveur local de test a été refusée. Ce point reste
ouvert avant de qualifier l'alpha de visuellement validée. Le serveur de test
et ses fichiers temporaires ont été retirés.

Validation de l'intégration dans la liste des chats : `npm run typecheck` et
`npm test` réussis (1 510 tests, dont 533 UI et 122 cache). Les nouveaux tests
couvrent la migration v36, les noms conservés après récupération, le refus de
renommer Principal, le regroupement par source et le déplacement confirmé ou
refusé d'un chat non ouvert. Les contrôles React ont une couverture de rendu
statique ; ils ne remplacent pas la vérification visuelle interactive.

`git diff --check` est propre. La revue `count-lines-review` a couvert la plage
400–500 lignes définie dans `AGENTS.md`, avec un contrôle séparé des nouveaux
fichiers. Le menu du chat est extrait dans un composant de 111 lignes ; sa ligne
d'affichage en compte 101. Les autres nouveaux composants comptent moins de
80 lignes. Les façades existantes `PublicRuntimeApis` (540 lignes) et le routeur
(523 lignes) reçoivent uniquement le nouveau contrat et son routage, sans
nouvelle orchestration métier dans ces fichiers.

Validation du stockage configurable : `npm run typecheck` et `npm test`
réussis (1 525 tests, dont 536 UI, 718 backend et 123 cache). Le scénario Git
réel crée `<espace>/<projectId>/<workspaceId>`, simule une interruption
de publication, rouvre SQLite puis récupère le même checkout après changement
de la configuration JSON. Aucun appel à un LLM n'est nécessaire.

La revue de taille conserve la plage 400–500 lignes : les nouveaux composants
de réglages font 70 et 90 lignes, le module de chemins 65 lignes. Les mutations
des réglages sont sérialisées et ne deviennent actives qu'après sauvegarde.
La vérification visuelle interactive des nouveaux réglages reste ouverte.

Aucun commit, changement de version ou merge n'a été effectué.
