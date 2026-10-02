# Permissions du navigateur

Les sources locales et les commandes personnalisées avec accès local disposent
d’un bouton « Permissions du navigateur — source » sur leur carte dans Home.
Le menu d’une conversation propose « Permissions du navigateur — chat » pour
les mêmes sources. Les brouillons sans conversation Codex ne sont pas concernés.

L’éditeur permet de consulter, autoriser, bloquer ou réinitialiser une décision
pour l’accès à un site, les téléchargements, l’envoi de fichiers ou l’accès CDP.
La vue du chat présente aussi les règles globales, en lecture seule. Un refus
global ou propre au chat reste prioritaire sur une autorisation. Les politiques
Codex et les autres réglages du plugin restent également applicables.

Réinitialiser supprime une décision enregistrée ; cela ne crée pas une nouvelle
autorisation. Le navigateur pourra demander l’accord de l’utilisateur à nouveau.

## Stockage et compatibilité

Le backend demande à la source son fichier de configuration utilisateur via
`config/read`, puis utilise le dossier `browser` situé à côté de ce fichier.
Il respecte ainsi un `CODEX_HOME` personnalisé, sans supposer que tous les clients
utilisent le dossier personnel de l’application Electron.

Les sources qui utilisent le même `CODEX_HOME` partagent les permissions
globales du navigateur.

- Global : `browser/config.toml`.
- Chat : `browser/sessions/<identifiant-du-chat>.toml`.

Les sections prises en charge sont `origins`, `downloads`, `uploads` et
`full_cdp`. Chacune comporte éventuellement des tableaux de chaînes `allowed`
et `denied`. Une modification concerne un seul motif dans une seule section.
Les autres sections et champs sont conservés.

Ce format interne a été vérifié dans le plugin Browser OpenAI
`26.930.21537`. Il ne constitue pas un contrat public garanti par OpenAI.
Un format incompatible bloque l’écriture. Les fichiers symboliques et les
fichiers dépassant 1 Mio sont également refusés.

La bibliothèque `smol-toml` fournit une analyse TOML complète, sans parseur
maison. Les types numériques inconnus sont préservés. Une sérialisation peut
modifier la présentation ou retirer les commentaires : les octets précédents
sont sauvegardés dans `<fichier>.opencodexui.bak` avant le remplacement.
Cette sauvegarde est remplacée à chaque nouvelle écriture.

Une révision du contenu protège contre les changements survenus depuis
l’ouverture de l’éditeur. Le remplacement utilise un fichier temporaire dans
le même dossier. Une dernière vérification limite les conflits avec le plugin,
mais aucun verrou commun aux deux programmes ne garantit l’absence absolue
d’une écriture concurrente entre la vérification et le remplacement.

## Rechargement

Une modification externe peut rester en cache dans le navigateur. Après une
sauvegarde, l’éditeur propose de recharger la connexion Codex. Ce redémarrage
est explicite et refusé tant qu’un agent travaille dans OpenCodexUI. Les fichiers
de permissions ne sont pas réinitialisés par le redémarrage.

Les sources WSL, SSH et les commandes personnalisées sans accès local ne sont
pas prises en charge par cet adaptateur. Leurs chemins ne sont jamais interprétés
comme des chemins de l’hôte Electron.
