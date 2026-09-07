# Découverte des worktrees externes

La requête `projectWorkspaces.discover` reçoit un `projectId` et un `sourceId`
explicites. Elle complète le catalogue du projet à partir des worktrees que Git
connaît, par exemple ceux créés manuellement en ligne de commande.

Cette opération appartient au lot 3 du
[suivi de livraison](workspaces-delivery-plan.md). Elle modifie le cache après
vérification ; elle ne crée, ne déplace, ne supprime et ne déverrouille aucun
checkout Git. Elle n'est pas lancée implicitement pendant l'indexation.

## Vérifications

Le backend retrouve le workspace principal et exige la même source. Il lit
la liste Git complète, vérifie que le principal est une racine de checkout,
puis contrôle dans la source les répertoires et leur répertoire Git commun.
Les chemins ne sont jamais résolus sur le système de fichiers d'Electron.
Le répertoire Git commun du principal est relu avant publication.

Un chemin relatif ou dans une syntaxe non prise en charge, un répertoire absent
ou symbolique, une entrée bare/prunable ou un dépôt différent sont signalés
sans être adoptés. Une erreur de source non identifiable comme chemin absent
interrompt la découverte avant toute insertion : pas de résultat partiel caché.

La vérification suit les mêmes limites de chemins que la création : les alias
d'ancêtres ne constituent pas une identité physique universelle. Elle ne
fournit pas de verrou contre les modifications faites par un autre client Git.

## Règles du catalogue

L'enregistrement des chemins vérifiés est transactionnel :

- un nouvel espace découvert est secondaire et `managed: false` ;
- un espace déjà connu conserve son identifiant, son propriétaire et son rôle ;
- un espace créé par l'application reste `managed: true` ;
- un chemin associé à un autre projet est signalé, jamais fusionné ;
- une destination de création en attente ne peut pas être adoptée ;
- un workspace supprimé logiquement n'est pas réactivé automatiquement ;
- une entrée absente de la liste Git n'est pas supprimée du cache ;
- les conversations existantes ne sont ni déplacées ni réaffectées.

Le principal est revérifié dans la transaction. S'il a changé depuis la lecture
source, aucune insertion n'est réalisée. L'échec d'une insertion annule tout
le lot, et deux découvertes successives conservent les mêmes identifiants.

## Réponse pour l'interface

`workspaces` contient le catalogue conservé du projet. `skipped` contient les
chemins exclus avec une raison stable : `anotherProject`, `creationPending`,
`removed`, `unavailable`, `repositoryMismatch` ou `unsupportedPath`.

Le catalogue retourné n'est pas une garantie de disponibilité de chaque ancien
chemin : leur conservation permet de garder les historiques lisibles.
L'interface expose cet import comme action secondaire dans la liste des chats.
Les nouveaux workspaces reçoivent le nom de leur dossier ; les noms personnalisés
des workspaces déjà connus ne sont pas remplacés.

## Validation

Les tests SQLite couvrent l'idempotence, la propriété des espaces, les conflits
entre projets, les créations en attente, les sources distinctes, les changements
du principal et l'annulation transactionnelle d'un lot incomplet.

Les tests backend vérifient l'appartenance Git, les chemins indisponibles et les
sources déconnectées. Un test avec Git réel découvre un checkout externe
verrouillé et vérifie que son statut externe et son verrou sont conservés.
