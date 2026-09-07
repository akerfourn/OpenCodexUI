# Utiliser les workspaces

Un projet contient des workspaces nommés, qui contiennent leurs conversations.
Un workspace correspond à un worktree dans la même source Codex. Le workspace
**Principal** correspond au dossier de base du projet : il est non modifiable
et reste utilisable sans créer de workspace secondaire.

## Configurer le stockage automatique

Au démarrage, l'application prépare un espace **OpenCodexUI** pour la source
locale dans `<app-data>/workspaces`, si elle n'a pas déjà d'espace configuré.
`<app-data>` est le dossier de données de l'application fourni par Electron
(`userData`), qui contient aussi `settings.json`. Cet espace est présélectionné
pour les nouveaux workspaces locaux. Les préférences existantes sont conservées ;
un espace retiré volontairement n'est pas recréé au prochain démarrage.

Dans la rubrique **Workspaces** de la navigation principale, ajouter d'autres
espaces avec un nom, une source Codex et un dossier existant. Cette configuration
est enregistrée dans `settings.json`. Le sélecteur de dossiers est disponible
pour les sources partageant le système de fichiers local. Pour WSL ou SSH,
saisir un chemin absolu dans la source concernée.

Chaque source peut avoir plusieurs espaces, dont un par défaut. Son premier
espace devient automatiquement le défaut ; **Utiliser par défaut** permet de
le changer. À la création d'un workspace, cet espace est présélectionné et
l'application prépare cette arborescence :

```text
<espace>/
└── <projet-id>/
    └── <workspace-id>/     # fichiers du dépôt Git
```

Les identifiants sont stables et indépendants des noms affichés. L'identifiant
réel du workspace est généré par le backend au début de la création ; l'aperçu
montre donc `<workspace-id>` avant cette étape. Ce marqueur est remplacé par
l'identifiant réel : aucun dossier littéralement nommé `<workspace-id>` n'est
créé. Les fichiers sont directement dans le dossier du workspace.

Le formulaire permet de choisir un autre espace ou **Chemin personnalisé**
pour saisir un nouvel emplacement complet. Sans espace configuré pour cette
source, le chemin personnalisé reste disponible. Aucun chemin du système
hôte n'est imposé automatiquement à une source distante.

Modifier ou retirer un espace des paramètres ne déplace et ne supprime aucun
workspace existant. Une création interrompue garde sa destination initiale,
même si l'espace est ensuite modifié. Les sous-dossiers préparés peuvent rester
en place après un échec : aucune suppression automatique de fichiers n'est
utilisée pour annuler une création.

## Parcours disponibles

La liste des chats est organisée en groupes repliables portant le nom du
workspace. Chaque groupe comporte :

- une icône **bulle avec +** pour créer une conversation dans ce workspace ;
- un menu **… → Propriétés du workspace** pour consulter son chemin et modifier
  son nom. Le nom est enregistré ; le chemin est en lecture seule. Renommer
  n'effectue aucun déplacement physique.

**Créer un workspace** demande un nom, un emplacement de stockage et une
nouvelle branche, une branche locale disponible ou une révision détachée.
Le worktree Git est créé derrière cette action métier. Les workspaces déjà
existants reçoivent initialement le nom de leur dossier ; leur identité et
leurs conversations sont conservées.

Le menu de gestion des workspaces propose **Importer les workspaces existants**.
Cette action secondaire explique puis enregistre les worktrees Git existants
du dépôt. Les noms déjà personnalisés sont conservés lors des imports suivants.

Pour déplacer une conversation, utiliser son menu **… → Changer de workspace**,
puis choisir et confirmer la destination. L'action concerne ce chat, même
s'il n'est pas actuellement ouvert. Le groupe change seulement après validation
du backend ; un refus conserve la conversation dans son groupe d'origine.

La création Git nécessite un dépôt déclaré fiable dans Codex. Le chemin de
création doit être extérieur au checkout principal. Le mode automatique crée
les sous-dossiers dans l’espace existant ; un chemin personnalisé exige un
parent déjà présent.
Les modifications non commitées ne sont pas copiées dans le nouveau worktree.

La bascule affiche sa destination et ses conséquences avant confirmation.
Les approbations existantes sont conservées. Le profil autorise les écritures
dans le checkout choisi et les dossiers partagés configurés. Il désactive le
réseau et les écritures temporaires, et applique les exclusions des fichiers
`.env` des dossiers partagés. Une politique personnalisée incompatible est
refusée ; elle n'est pas remplacée automatiquement.

Git, Docker Compose, les commandes, les recherches du compositeur et les
ouvertures du dossier suivent le checkout courant. Les brouillons Git restent
propres à chaque checkout. Les conversations sont regroupées
par workspace dans leur projet. Chaque nouveau tour conserve son chemin
d'exécution dans l'historique.

## Refus et récupération

- Une conversation vide n'a pas encore d'historique reprenable dans Codex.
  Utiliser le bouton **+** du workspace souhaité avant le premier message. Aucun tour artificiel ni appel LLM supplémentaire n'est nécessaire.
- Attendre la fin des conversations actives dans la source avant une bascule.
  Les sous-agents encore chargés bloquent aussi la bascule. Les terminer, puis
  redémarrer la source si Codex les conserve chargés.
- La reprise contrôlée arrête les processus internes de la conversation.
  Les services externes, terminaux et commandes lancés séparément restent dans
  leur dossier d'origine : changer de workspace ne les déplace pas.
- Les chemins et leurs ancêtres doivent être des dossiers sans lien symbolique.
  Les configurations `.codex` symboliques sont également refusées. Les espaces
  de fichiers distants restent interprétés uniquement par leur source.
- **Récupérer** vérifie une opération interrompue. Une création Git confirmée
  peut être publiée après réouverture du cache ; une bascule peut être achevée
  après vérification du même contrat de permissions.
- Un résultat externe inconnu reste bloqué. En particulier, une réponse perdue
  à la création d'un thread sans identifiant ne permet pas de recréer ce thread
  automatiquement. Le blocage est conservé dans le cache.

Les API expérimentales utilisées ont été caractérisées avec Codex 0.153.4.
Une source ne proposant pas les contrôles requis échoue explicitement.
L'inventaire des sessions chargées est borné à 100 ; une liste incomplète est
refusée. Les alias par montages et les modifications concurrentes effectuées
hors de l'application ne constituent pas une garantie d'isolation générale.

La suppression physique, le déplacement des checkouts et les worktrees créés
automatiquement pour les sous-agents restent hors de cette première livraison.
