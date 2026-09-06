# Audit Codex : changement de workspace et déplacement de projet

Date : 6 septembre 2026.

Complément : les [essais locaux](codex-workspace-local-tests.md), effectués
après cet audit, valident une première procédure de transition sur Linux.
Les mentions « non exécuté » ci-dessous décrivent l'audit initial ; les tests
Rust amont restent non exécutés, mais le vrai app-server a depuis été testé
avec un fournisseur de réponses simulées et de vrais outils.

## Conclusion

Codex sait changer le répertoire d'un thread existant et renouveler ses
instructions de projet. Il n'est pas nécessaire de créer une nouvelle
conversation pour chaque workspace.

En revanche, envoyer uniquement `cwd` ne constitue pas une transition complète
de contexte. Les permissions, les processus existants et les sous-agents
nécessitent un traitement explicite. Le déplacement d'un projet ajoute la
disparition possible des chemins encore utilisés.

La base OpenCodexUI reste pertinente. Cet audit ne révèle pas de nécessité de
refondre les identités ou l'historique. Il identifie les conditions à remplir
avant d'exposer la bascule et le déplacement.

## Périmètre et méthode

- CLI locale : `codex-cli 0.153.4`.
- Sources : tag `rust-v0.153.4`, commit
  `3d2ee51ca2d5db578f328aa75e20aa22c0197c9a` du dépôt `openai/codex`.
- Lecture du code, des assertions des tests amont et de l'intégration locale.
- Aucun test Rust amont exécuté, aucun appel modèle effectué.
- Aucun déplacement de projet ou changement de code applicatif effectué.

Les constats concernent cette version. Une source personnalisée, distante ou
utilisant un autre binaire doit faire l'objet d'une vérification de capacité.
Les tests cités constituent des preuves de comportement attendu dans les
sources ; leur présence ne signifie pas qu'ils ont été exécutés ici.

## Résultats

### 1. Le changement de dossier est une capacité réelle

`turn/start` construit une nouvelle sélection d'environnement. Avec seulement
`cwd`, il remplace dans les racines d'exécution l'entrée égale à l'ancien cwd,
conserve les racines supplémentaires et déduplique le résultat.
Les sélections explicites d'environnement suivent une autre branche et
possèdent leurs propres racines. [Implémentation][environment-override]

Un test app-server vérifie aussi que des `runtimeWorkspaceRoots` explicites
sur un thread chargé sont ensuite retournées par `thread/resume`.
[Test des racines][roots-test]

Conséquence : la transmission actuelle de `turn/start.cwd` dans OpenCodexUI
est justifiée. Elle ne prouve toutefois pas que les droits effectifs sont
limités au nouveau workspace.

### 2. Les AGENTS.md sont renouvelés, sans effacement de l'historique

Le gestionnaire recharge les instructions lorsque les sélections
d'environnement ou le niveau de confiance du projet changent. Il est appelé
pendant la capture du contexte utilisé par le modèle.
[Gestionnaire][agents-manager], [appel][agents-refresh]

Le test `snapshot_model_visible_layout_cwd_change_refreshes_agents` passe
entre deux dossiers contenant des instructions distinctes. Il vérifie que
la deuxième requête conserve l'ancien élément d'instructions dans l'historique
et ajoute son remplacement. [Test][agents-test]

Le risque de conserver uniquement les anciens AGENTS.md est donc fortement
réduit pour ce parcours. En revanche, les anciens messages et chemins restent
visibles dans la conversation. La bascule doit être annoncée clairement au
modèle, sans réécrire les anciens tours.

Limite : ce cache ne constitue pas une surveillance des modifications de
fichiers à sélection et niveau de confiance inchangés. Ce test ne démontre
pas non plus le rechargement de tous les éléments de `.codex/config.toml`.

### 3. Une reprise de thread chargé n'applique pas toujours les paramètres

Lorsque des paramètres diffèrent, Codex peut décharger puis reprendre à froid
un thread inactif, sans abonnés, autorisé à recevoir des entrées directes.
Dans les autres cas, il conserve la session et journalise que les paramètres
de reprise sont ignorés. Un échec de fermeture conserve également la session.
[Implémentation][warm-resume]

Une réponse réussie à `thread/resume(cwd=B)` ne suffit donc pas à établir que
le thread est passé dans B. Le mot « chargé » ne signifie pas nécessairement
qu'un tour est en cours : un thread inactif peut encore avoir des abonnés.

Conséquence : ne pas utiliser la seule reprise comme preuve de bascule.
Le `cwd` sur `turn/start` traite le dossier, mais il reste à établir un parcours
fiable pour les autres paramètres et à vérifier le contexte retourné.

### 4. Les permissions constituent le principal risque concret

Codex préserve délibérément certaines politiques lors d'un changement de cwd.
Le test `session_configuration_apply_preserves_absolute_cwd_write_root_on_cwd_update`
vérifie qu'une autorisation absolue d'écrire dans A reste valable dans A et
n'autorise pas automatiquement B. Un autre test conserve une politique
combinant racines symboliques et restriction sur un chemin explicite.
[Tests][permission-tests], [logique de transition][permission-apply]

Les racines effectives combinent celles de l'environnement avec celles du
profil de permissions. Remplacer les racines d'exécution ne suffit donc pas
à supprimer une ancienne racine présente dans le profil.
[Combinaison][effective-roots]

Dans OpenCodexUI, `ProjectContextService` génère un profil qui étend
`:workspace`, inscrit le chemin absolu du projet dans `workspace_roots` et
ajoute les règles des dossiers externes. `ThreadTurnStartService` transmet
le cwd, mais ne remplace pas ce profil lors du démarrage du tour.

Déduction pour l'application : une bascule limitée au cwd peut conserver
l'ancien projet parmi les chemins accessibles. Selon la politique, elle
peut aussi laisser le nouveau dossier insuffisamment autorisé. Le test amont
des droits absolus n'est pas une reproduction complète du profil OpenCodexUI ;
ce profil précis doit faire l'objet d'un test d'intégration ciblé.

La reprise à froid recharge une configuration. Des tests vérifient que le
profil persistant est résolu à nouveau et que des permissions explicitement
fournies peuvent prendre priorité. Cela offre une piste solide pour une
transition contrôlée, sans garantir la même chose sur une session chargée.
[Reprise à froid][cold-resume], [tests][cold-permissions]

### 5. Changer le parent ne déplace pas un processus déjà lancé

Le gestionnaire d'exécution ouvre ses sessions avec leur cwd. Les appels
`write_stdin` retrouvent ensuite le processus par son identifiant ; ils ne
créent pas une nouvelle session dans le nouveau dossier.
[Gestionnaire de processus][process-manager]

Un tour terminé n'est donc pas une preuve suffisante d'absence de processus
attaché à A. La même précaution vaut pour les commandes et services lancés
par OpenCodexUI. Le blocage des tours actifs prépare cette protection mais
ne la remplace pas.

Conséquence : inventorier ou arrêter les processus concernés avant déplacement
ou suppression. Pour la bascule, conserver leur contexte d'origine et éviter
qu'une ancienne session soit présentée comme appartenant à B.

### 6. Les sous-agents possèdent leur propre contexte

Codex prévoit un héritage par instantané des environnements du parent.
Ce mécanisme ne constitue pas un déplacement collectif des enfants existants.
[Héritage][agent-inheritance]

Les enfants V2 contrôlés par leur parent suivent en outre une reprise spéciale
qui ne transmet pas les paramètres publics de reconfiguration du demandeur.
[Reprise des enfants][child-resume]

Conséquence : ne pas propager en base une bascule du parent à ses enfants sans
preuve de leur contexte réel. Un enfant encore actif doit être pris en compte
avant de déplacer ou supprimer son ancien workspace.

### 7. La reprise après déplacement est plausible, pas entièrement certifiée

La reprise à froid recherche le cwd dans les derniers paramètres persistés du
thread concerné, puis dans les métadonnées initiales en secours. La construction
de configuration reçoit aussi les paramètres explicites de reprise.
[Sélection du contexte][history-cwd], [chargement][cold-resume]

Cela permet d'envisager une reprise explicite vers le nouvel emplacement en
conservant l'identité du thread. Ce n'est pas une migration générale des chemins
absolus présents dans la configuration, l'historique ou les outils externes.

Cet audit ne démontre pas le scénario complet où A a disparu : reprise,
permissions générées par OpenCodexUI, exécution, puis second redémarrage.
Ce scénario reste à tester sur un projet jetable. Un déplacement entre
systèmes de fichiers ou sources différents demande une validation distincte.

## Évaluation qualitative

| Sujet | Risque avant protections supplémentaires | Confiance |
| --- | --- | --- |
| Nouveau cwd et AGENTS.md | Faible sur le parcours étudié | Code et test amont |
| Bascule par resume uniquement | Élevé : paramètres parfois ignorés | Code explicite |
| Isolation des permissions A/B | Élevé : anciens droits conservables | Code et tests ; intégration à tester |
| Anciens chemins dans les messages | Modéré : confusion possible | Historique conservé par le test |
| Processus et enfants existants | Élevé pour suppression/déplacement | Contextes indépendants dans le code |
| Reprise avec A disparu | À valider avant exposition | Parcours complet non exécuté |

Ces niveaux expriment l'impact et les lacunes de protection, pas des
probabilités mesurées ni des incidents constatés chez l'utilisateur.

## Plan d'action issu de l'audit

1. Définir une transition explicite comprenant source, cwd, racines et profil
   de permissions. Vérifier le contexte effectif avant de considérer la
   transition comme acquise. Ne pas élargir les droits pour contourner un échec.
2. Tester ce contrat avec le profil réellement généré par OpenCodexUI : A vers
   B sur thread chargé, puis reprise à froid. Vérifier les écritures permises
   dans B, les accès résiduels à A et les restrictions des dossiers externes.
3. Étendre les protections aux reviews, compactions, rollbacks, processus et
   enfants concernés. Traiter aussi les modifications par un autre client :
   les réservations locales ne verrouillent pas Codex globalement.
4. Exposer création et sélection des workspaces après validation de ce contrat.
   Annoncer au modèle le nouveau contexte ; conserver l'historique des tours.
5. Livrer le déplacement séparément : vérifier la destination côté source,
   gérer les chemins de configuration, fermer les activités concernées,
   reprendre explicitement, puis valider un redémarrage avec A absent.

Les expériences nécessaires sont ainsi ciblées. Il n'est plus nécessaire de
traiter le changement de cwd ou le renouvellement des AGENTS.md comme des
capacités entièrement inconnues.

[environment-override]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/app-server/src/request_processors/turn_processor.rs#L689
[roots-test]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/app-server/tests/suite/v2/thread_resume.rs#L621
[agents-manager]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/core/src/agents_md_manager.rs
[agents-refresh]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/core/src/session/mod.rs#L3540
[agents-test]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/core/tests/suite/model_visible_layout.rs#L381
[warm-resume]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/app-server/src/request_processors/thread_processor.rs#L4168
[permission-tests]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/core/src/session/tests.rs#L5832
[permission-apply]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/core/src/session/session.rs#L450
[effective-roots]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/core/src/session/turn_context.rs#L404
[cold-resume]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/app-server/src/request_processors/thread_processor.rs#L3808
[cold-permissions]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/app-server/tests/suite/v2/thread_resume.rs#L1219
[process-manager]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/core/src/unified_exec/process_manager.rs#L804
[agent-inheritance]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/core/src/agent/control.rs#L727
[child-resume]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/app-server/src/request_processors/thread_processor.rs#L3680
[history-cwd]: https://github.com/openai/codex/blob/3d2ee51ca2d5db578f328aa75e20aa22c0197c9a/codex-rs/app-server/src/request_processors/thread_processor.rs#L3745
