# Notes du projet

_In English: [notes.md](notes.md)_

Notes de travail sur Cassini : comment c'est construit, ce qui est fait, ce qui
reste. Le [README](README.md) en est la version courte, pour qui arrive sur le
projet. Ce fichier en est la version longue.

Les deux versions portent le même contenu. Quand on modifie l'une, on modifie
l'autre, ou on dit dans le message de commit laquelle a pris de l'avance.

## Sommaire

- [Ce qu'est Cassini](#ce-quest-cassini)
- [Comment ça marche](#comment-ça-marche)
- [État des fonctionnalités](#état-des-fonctionnalités)
- [Tâches VS Code](#tâches-vs-code)
- [Notes de mise en œuvre](#notes-de-mise-en-œuvre)
- [Ce qui reste à faire](#ce-qui-reste-à-faire)

---

## Ce qu'est Cassini

Une application de bureau Windows, construite avec Tauri v2 et React, qui
rassemble tous les jeux installés en une seule bibliothèque. Plutôt que d'ouvrir
Steam, Epic, Battle.net, Ubisoft Connect, Riot, Rockstar, Hytale, HoYoPlay et
l'application Xbox les uns après les autres, Cassini les scanne tous et montre
le résultat au même endroit : soit en liste, soit en galaxie, où chaque launcher
est un système solaire et chaque jeu une planète.

---

## Comment ça marche

### Démarrage

Chaque lancement scanne les neuf launchers en parallèle, par
`scannerTousLesLaunchers`. Les scans partent ensemble, mais la fusion est
séquentielle : chaque plateforme s'applique sur le résultat de la précédente,
sinon la dernière écraserait les autres. Le stockage n'est réécrit que si le
contenu a réellement changé. La comparaison passe par une empreinte insensible à
l'ordre, sans quoi la galaxie se reconstruirait à chaque lancement. Les
changements se propagent en direct à la liste et à la scène 3D par
`subscribeGames`. La bibliothèque elle-même vit dans le store Tauri
(`archive.json`), avec `localStorage` en repli hors Tauri.

### Scan des launchers, côté Rust

Chaque plateforme a sa propre commande Tauri, appelée depuis le frontend :

| Commande               | Ce qu'elle lit                                                            |
| ---------------------- | ------------------------------------------------------------------------- |
| `scan_steam_games`     | Le registre Windows et les manifestes `.acf` de chaque bibliothèque Steam |
| `scan_epic_games`      | Les manifestes `.item` du dossier ProgramData d'Epic                      |
| `scan_battlenet_games` | Le registre, filtré sur Blizzard comme éditeur                            |
| `scan_riot_games`      | League of Legends, Valorant et les autres                                 |
| `scan_rockstar_games`  | GTA, RDR2 et consorts, par le launcher Rockstar                           |
| `scan_ubisoft_games`   | Ubisoft Connect                                                           |
| `scan_xbox_games`      | Les dossiers `XboxGames` et l'inventaire des paquets de l'utilisateur     |
| `scan_hoyoplay_games`  | L'inventaire qu'HoYoPlay tient dans le registre                           |
| `scan_hytale_games`    | Le launcher Hytale                                                        |

Après un nouveau scan, les jeux qui ne sont plus présents sont marqués non
installés plutôt que supprimés.

### Déduplication

Un même jeu peut apparaître sur plusieurs plateformes, Overwatch sur Steam et
Battle.net par exemple. Cassini déduplique sur un nom normalisé et applique une
priorité : Steam, puis Epic, puis Battle.net. Les données de l'utilisateur,
favori, dernière session et image personnalisée, sont fusionnées sur l'entrée
conservée.

### Lancement d'un jeu

Chaque jeu porte une `launchUrl`, soit un lien de protocole comme
`steam://rungameid/12345`, soit un chemin d'exécutable. Cliquer sur Jouer demande
au système de l'ouvrir. La date de dernière session est enregistrée
automatiquement.

### Jaquettes

La résolution se fait en cascade, pour chaque carte :

1. **Image personnalisée** (`customImageUrl`). Priorité absolue, jamais
   remplacée.
2. **Steam, par AppID.** L'adresse du CDN se calcule depuis l'identifiant du
   jeu, donc sans clé d'API, et reste disponible même quand le jeu est
   désinstallé. En cas d'échec, repli sur le format portrait.
3. **SteamGridDB**, pour tout le reste. La clé d'API vit dans le gestionnaire
   d'identifiants Windows et ne traverse jamais le JavaScript : le frontend
   appelle `fetch_sgdb_image(title)` et Rust va chercher la clé au dernier
   moment. Les résultats sont mis en cache dans le store.

Le service s'appelle `coverArtService`. Il s'appelait `rawgService` du temps où
il interrogeait RAWG.io, et quelques noms de fichiers en gardent la trace.

### Recherche et filtres

La barre de recherche globale filtre par titre au fil de la frappe. La
bibliothèque a deux onglets, tous les jeux et les favoris, plus des filtres par
plateforme, état d'installation et tag. La vue et la recherche vivent dans
l'adresse, en paramètres de requête.

### Page des launchers

Liste les launchers détectés sur la machine, avec de quoi ouvrir chacun ou
afficher son dossier d'installation. Les icônes sont extraites de l'exécutable et
mises en cache.

### Lecteur de musique

Joue MP3, FLAC, WAV, OGG, M4A et Opus. On choisit un dossier, Rust le parcourt
récursivement. La dernière piste et le volume sont mémorisés.

Le lecteur n'est plus une page. Il s'ouvre en calque sur le système solaire, par
`Ctrl+M` ou le bouton au pied de la barre des launchers. Quitter la vue pour
changer d'album, c'était perdre ce qu'on regardait. Le calque est un lecteur et
rien d'autre : pochette, titre, une course de lecture, cinq commandes, le
volume, une recherche, et deux sections, ce qu'on vient d'écouter puis tout le
reste, quatre-vingts lignes au plus. Au-delà, on cherche plutôt que de faire
défiler. Aucune métadonnée n'est lue pour construire la liste, titre et dossier
suffisant à choisir, et les lire toutes ralentirait l'ouverture pour rien.

La page musique reste pour ce qui demande de la place et se fait rarement :
renommer, déplacer, changer une pochette, colorer un dossier. Un lien discret du
lecteur y mène.

Un bandeau en bas à gauche dit ce qui joue : pochette, titre, de quoi changer de
piste, et un fil de progression sur le bord. Aléatoire, répétition et volume s'y
trouvaient aussi. Ils sont dans le lecteur désormais, à un clic sur la pochette.

### Métadonnées iTunes

Au démarrage, l'application cherche sur iTunes l'artiste, l'album et la pochette
de chaque piste. Les résultats sont gardés en mémoire seulement. Le terme de
recherche est construit comme `Artiste - Titre`, en utilisant le tag ID3 artiste
quand il y en a un, et un score de correspondance est calculé côté Rust
(`word_recall`, seuil 0,7). Les pistes sans correspondance satisfaisante
n'affichent rien plutôt qu'une mauvaise pochette.

### Ce qui se pose sur la vue

Il n'y a plus de barre latérale de navigation. À terme, seul le système solaire
doit rester. Ce qu'elle portait s'est réparti sur les quatre coins de la vue : la
marque en haut à gauche, le compteur d'images en haut à droite, les commandes de
déplacement en bas à droite, ce qui joue en bas à gauche. Les deux premiers se
calent sur la colonne de droite et suivent sa largeur, qui se règle.

Les réglages et la musique sont deux calques posés sur la scène, `Ctrl+,` et
`Ctrl+M`. Ils ne démontent jamais la scène, qui reste derrière eux. Les deux
retiennent la tabulation, rendent le focus à son point de départ, et se ferment
par Échap ou par un clic à côté.

Les autres pages, bibliothèque et launchers, sont masquées par défaut. Les
réglages les rappellent une à une, et leur bouton apparaît alors au même endroit.
Elles ne sont pas supprimées, seulement retirées du chemin le plus court.

### Intégration à Windows

- **Lancement au démarrage** écrit une clé sous
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`.
- **Rester en arrière-plan** change le bouton de fermeture en masquage :
  l'application se range dans la zone de notification, un clic sur l'icône la
  rappelle, et le menu de la zone permet de quitter pour de bon.

---

## État des fonctionnalités

Partiel veut dire qu'une partie marche et qu'une autre manque. Le détail est dans
[Notes de mise en œuvre](#notes-de-mise-en-œuvre).

### Bibliothèque

| Fonctionnalité                                         | État                      |
| ------------------------------------------------------ | ------------------------- |
| Scan automatique, neuf launchers                       | Fait                      |
| Déduplication entre plateformes                        | Fait                      |
| Lancement avec animation                               | Fait                      |
| Dernière session par jeu                               | Fait                      |
| Favoris                                                | Fait                      |
| Jaquettes : CDN Steam, SteamGridDB, personnalisée      | Fait                      |
| Cache des jaquettes dans le store, et de quoi le vider | Fait                      |
| Recherche en temps réel par titre                      | Fait                      |
| Tags posés à la main, proposés ou libres               | Fait                      |
| Tri par nom et par récence                             | Fait                      |
| Filtres par plateforme, état d'installation et tag     | Fait                      |
| Taille sur disque                                      | Fait                      |
| Ajouter un jeu en choisissant un `.exe`                | Code écrit, pas de bouton |
| Export et import de la bibliothèque en JSON            | Fait                      |
| Tri par taille ou temps de jeu                         | À faire                   |
| Notes par jeu                                          | À faire                   |
| Vue liste en alternative à la grille                   | À faire                   |
| Statistiques de jeu et graphiques                      | À faire                   |
| Expiration du cache des jaquettes                      | À faire                   |

### Plateformes

| Plateforme                                       | État                          |
| ------------------------------------------------ | ----------------------------- |
| Steam, Epic, Battle.net, Ubisoft, Riot, Rockstar | Fait                          |
| Xbox et Microsoft Store, Game Pass compris       | Fait, sauf la désinstallation |
| HoYoverse : Genshin, Honkai, Zenless             | Fait                          |
| Hytale                                           | Fait                          |
| GOG Galaxy                                       | À faire                       |

### Système solaire

| Fonctionnalité                                                | État    |
| ------------------------------------------------------------- | ------- |
| La galaxie en page d'accueil                                  | Fait    |
| Taille des planètes d'après le disque, ou le temps de jeu     | Fait    |
| Quatre familles d'anneaux planétaires                         | Fait    |
| Personnalisation par planète : taille, distance, anneaux      | Fait    |
| Systèmes solaires personnalisés, dont ceux pilotés par un tag | Fait    |
| Déplacer les planètes en glissant, en mode édition            | Fait    |
| Largeur réglable de la liste et de la barre des launchers     | Fait    |
| Système d'ouverture au choix                                  | Fait    |
| Raccourcis clavier                                            | Fait    |
| Différence de taille flagrante pour un très gros jeu          | Fait    |
| Anneaux d'orbite plus discrets vus de près                    | À faire |

### Ciel

| Fonctionnalité                                                   | État    |
| ---------------------------------------------------------------- | ------- |
| Événements aléatoires : étoile filante, passage, tempête, comète | Fait    |
| Supernova et trou noir, les deux gros                            | Fait    |
| Événements visibles de n'importe quelle distance                 | Fait    |
| Une musique par gros événement, avec son propre volume           | Fait    |
| Couper les événements sans couper le rideau de gaz               | Fait    |
| Succès pour avoir vu chaque événement                            | Fait    |
| Vaisseau promotionnel Steam, vaisseau d'actualités               | À faire |
| Choisir sa propre musique d'ambiance                             | À faire |

### Lecteur de musique

| Fonctionnalité                                        | État    |
| ----------------------------------------------------- | ------- |
| Scan récursif des dossiers                            | Fait    |
| Dossiers repliables, recherche, bandeau de lecture    | Fait    |
| Mémorise la dernière piste et le volume               | Fait    |
| Récemment écoutés, dix dernières pistes               | Fait    |
| Couleur par dossier, au clic droit                    | Fait    |
| Déplacer une piste depuis un menu contextuel          | Fait    |
| Pochettes ID3 embarquées                              | Fait    |
| Enrichissement iTunes, pochettes en ligne pour toutes | Fait    |
| Aléatoire et répétition                               | Fait    |
| Arborescence ou grandes icônes de dossier             | À faire |

### Application

| Fonctionnalité                                              | État    |
| ----------------------------------------------------------- | ------- |
| Mise à jour automatique par les releases GitHub             | Fait    |
| Français et anglais                                         | Fait    |
| Thème sombre et clair                                       | Fait    |
| Couleur d'accent et image de fond personnalisées            | Fait    |
| Lancement au démarrage, rester en arrière-plan              | Fait    |
| Réinitialisation complète                                   | Fait    |
| Scan en arrière-plan, état d'installation en direct         | Fait    |
| Panneau de débogage, absent des versions publiées           | Fait    |
| Tests unitaires et parcours filmés                          | Fait    |
| Accessibilité : langue, contrastes, focus, mouvement réduit | Fait    |
| Accessibilité : réglages de confort dans les Paramètres     | À faire |
| Taille de police de base plus grande                        | À faire |
| Notification quand un jeu finit de se télécharger           | À faire |

---

## Tâches VS Code

`Ctrl+Maj+P` puis **Run Task**, ou `Ctrl+Maj+B` pour la construction. Les tâches
sont dans `.vscode/tasks.json`, nommées « Catégorie : ce que ça fait ». VS Code
trie la liste par ordre alphabétique, donc le préfixe suffit à les regrouper.

### Application

| Tâche                                             | Ce qu'elle fait                                                                                                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **lancer en développement**                       | L'application complète, Rust compris, avec rechargement à chaud. Celle du quotidien.                                                                                                                                |
| **lancer le front seul (navigateur)**             | Vite sur `localhost:1420`, sans le côté Rust. Les scans de launchers échouent et la galaxie se construit depuis le stockage du navigateur. Pratique pour travailler l'interface sans attendre une compilation Rust. |
| **construire un .exe d'essai (local, non signé)** | Produit un installeur sous `src-tauri/target/release/bundle/`, pour l'essayer sur sa machine.                                                                                                                       |

**Construire un `.exe` d'essai et publier ne sont pas la même chose.** La
construction locale compile chez soi et s'arrête là. Le fichier reste sur le
disque, et il n'est pas signé, la clé privée n'existant que comme secret GitHub.
L'updater vérifie les signatures contre la clé publique de `tauri.conf.json` :
un installeur construit en local ne peut donc jamais servir de mise à jour. Il
répond à une seule question : est-ce que l'installeur marche, et est-ce que
l'application démarre une fois installée.

Publier est l'autre bout de la chaîne. La tâche pousse un tag, GitHub Actions
compile sur ses machines, signe le résultat, et attache au tag le `.exe`, sa
signature et le `latest.json` que les copies installées viennent lire. C'est la
seule voie qui atteint un utilisateur.

### Tests

| Tâche                              | Ce qu'elle fait                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **les 254 tests unitaires**        | TypeScript puis Rust, 8 secondes. Tâche de test par défaut.                                                                                       |
| **TypeScript seulement (204 cas)** | Logique de bibliothèque, stockage, traductions, géométrie des orbites.                                                                            |
| **TypeScript en surveillance**     | Rejoue les tests touchés à chaque sauvegarde. À laisser tourner.                                                                                  |
| **Rust seulement (50 cas)**        | Scanners, registre, choix du désinstalleur, extraction d'icônes.                                                                                  |
| **parcours filmés (7 cas)**        | Playwright ouvre l'application et la traverse. Laisse une vidéo et des captures par parcours. 1 min 30.                                           |
| **interface Vitest**               | Les tests dans un navigateur, cas par cas. Ouvrir l'adresse affichée dans le terminal : elle porte un jeton, et sans lui l'interface renvoie 403. |
| **interface Playwright**           | Rejoue un parcours pas à pas, avec l'inspecteur de sélecteurs. Pour en écrire un nouveau.                                                         |

### Rapports

| Tâche                              | Ce qu'elle fait                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **les 261 tests, films compris**   | Joue les trois suites, écrit `rapport-tests.html` et l'ouvre. 2 minutes.                                                                  |
| **rapide, sans rejouer les films** | Tests unitaires seulement, mais le rapport montre quand même les derniers films connus. 8 secondes.                                       |
| **ouvrir le dossier des films**    | Ouvre `.rapports/e2e/artefacts`. Le nom commence par un point, donc l'Explorateur le cache tant qu'on n'a pas coché « Éléments masqués ». |

### Qualité

| Tâche                                    | Ce qu'elle fait                                                                                                                                  |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **tout vérifier avant de pousser**       | Types, lint, mise en forme, rustfmt et clippy. Exactement ce que joue la CI : si ça passe ici, ça passe là-bas.                                  |
| **vérifier les types (TypeScript)**      | `tsc` sans produire de fichiers.                                                                                                                 |
| **chercher les défauts (ESLint)**        | Le moindre avertissement fait échouer, comme sur la CI.                                                                                          |
| **corriger ce qui peut l'être (ESLint)** | Applique les corrections automatiques. Modifie les fichiers.                                                                                     |
| **remettre en forme (Prettier)**         | Réécrit tout le dépôt au format du projet. Modifie les fichiers.                                                                                 |
| **clippy et rustfmt (Rust)**             | Même exigence côté Rust. La CI fige le compilateur à 1.92.0, pour qu'une sortie de Rust n'introduise pas de nouveaux lints du jour au lendemain. |

### Documentation et publication

| Tâche                                   | Ce qu'elle fait                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **refaire les captures du README**      | Ouvre l'application, sème vingt jeux, photographie six vues et filme le voyage. Le GIF demande un vrai ffmpeg : `FFMPEG=/chemin/vers/ffmpeg` s'il n'est pas dans le PATH.  |
| **publier la version aux utilisateurs** | Pose le tag et le pousse. Voir plus haut. Sans retour arrière : une règle du dépôt interdit de déplacer ou de supprimer un tag une fois posé, l'updater s'appuyant dessus. |

### Avant de publier

1. Monter le numéro dans `package.json`, `src-tauri/tauri.conf.json` et
   `src-tauri/Cargo.toml`.
2. Écrire les notes dans `src/features/patchNotes/changelog.ts`, en français et
   en anglais.
3. Lancer **Qualité : tout vérifier avant de pousser**.
4. Lancer **Rapport : les 261 tests, films compris**.
5. Commit, push, puis **Publication : publier la version aux utilisateurs**.

---

## Notes de mise en œuvre

Ce qui suit consigne les décisions que le code ne rend pas évidentes, et quelques
impasses qu'il vaut mieux ne pas reprendre deux fois.

### La galaxie

Les neuf launchers partagent une seule galaxie. Chaque système est construit à
l'approche de la caméra et libéré quand elle s'éloigne. La taille d'une planète
vient de la taille sur disque, ou du temps de jeu quand ce réglage est actif.
Steam tient le temps de jeu en local, dans
`userdata/<compte>/config/localconfig.vdf`, que `steam_scan::temps_de_jeu` lit
sans clé d'API. Les systèmes sans temps de jeu connu retombent sur l'espace
disque, et un jeu jamais lancé retombe parmi les petits.

Une planète sur trois environ porte des anneaux, tirés parmi quatre familles
calquées sur le vrai système solaire : la nappe large et divisée de Saturne, les
rubans étroits et très basculés d'Uranus, le voile de poussière de Jupiter, les
arcs de Neptune. Ce qui les distingue de loin, c'est la largeur relative,
l'opacité, l'inclinaison et le fait d'être complets ou non. La seule graine n'en
changeait que le grain, et deux anneaux se ressemblaient dès qu'on prenait du
recul.

Les arcs ont dû être repris. Ils tiraient deux à quatre secteurs isolés, découpés
net, sans rien pour dire qu'ils appartenaient au même cercle : on voyait des
éclats flotter autour de la planète. Un voile continu les porte désormais, leurs
extrémités s'éteignent par le canal alpha des sommets, et le tirage est passé à
trois à cinq. La texture d'anneau est aussi passée en mipmaps : ses 1024 texels
tiennent parfois dans dix pixels, pour un anneau étroit vu de loin ou n'importe
lequel vu par la tranche, et sans niveaux réduits le rubanage se changeait en
pointillés qui grouillaient.

### Systèmes personnalisés

Le bouton **+** crée un système : nom, icône parmi douze, couleur, et jeux
choisis dans toute la bibliothèque. « Modifier » ouvre un panneau posé sur la
scène qui agit en direct : taille du soleil, vitesse des planètes jusqu'à les
figer, orbites à plat, et pour chaque planète sa distance, son angle et sa
taille. On y ajoute et retire des jeux, on les trie d'un coup, et on y supprime
le système. Rien n'est enregistré avant « Enregistrer », et « Annuler » rend le
système tel qu'il était.

Ces changements ne reconstruisent que le système concerné. La galaxie et la
caméra restent en place. Seuls le nom et la couleur, qui touchent l'étiquette et
les teintes, rebâtissent la scène. Un système désigne ses jeux sans les posséder :
un jeu rangé dans « Favoris » reste dans son launcher, avec une planète dans
chacun.

Les systèmes des launchers se personnalisent comme les autres, moins ce qui
appartient à la bibliothèque, donc ni nom, ni icône, ni liste de jeux. Leurs
réglages sont rangés à part, et un réglage revenu à sa valeur par défaut n'est
pas gardé.

Un système peut aussi être piloté par un tag. Il reprend tous les jeux qui le
portent et se met à jour quand on en tague un autre, sans liste à tenir.

Logique dans `lib/customSystems.ts`, application aux planètes dans
`scene/placements.ts`, les deux vérifiées hors navigateur.

### Déplacer les planètes

Pendant l'édition d'un système, une planète se saisit à la souris et suit le
pointeur. Le rayon est projeté sur le plan de sa propre orbite, inclinaison
comprise, puis reconverti en distance et en angle. La caméra ne tourne pas
pendant le geste, la saisie se faisant en capture, avant les contrôles.
L'éditeur reste maître du brouillon : la scène lui signale le glissement, il en
fait un placement borné comme ceux des curseurs, et ouvre les réglages de la
planète pour qu'on les voie suivre.

Les flèches qui montaient ou descendaient une planète d'une orbite ont disparu.
Le glissement la place où l'on veut plutôt que d'un cran.

### Les événements du ciel, visibles de partout

L'étoile filante, le passage, la supernova et la comète vivaient à leur vraie
place dans la galaxie. Elles y étaient condamnées deux fois : le plan lointain de
la caméra les tranchait au-delà de vingt mille unités, et elles rapetissaient à
mesure qu'on s'éloignait. Une supernova à l'autre bout de la galaxie n'existait
pour personne.

Chacune garde maintenant sa vraie trajectoire, mais on n'en retient que la
direction, et elle se dessine sur une sphère autour de l'œil, à `RAYON_CIEL`
(2200). Même coin de ciel, même taille apparente, plus rien à couper. Ce qui a
une étendue suit la même règle : la traînée est bâtie en angle plutôt qu'en
distance, la queue de la comète est bornée en parts de ciel, et la direction
qu'on leur donne est la part de leur course perpendiculaire au regard, puisque ce
qui vient droit sur nous ne traverse pas le ciel. La distance au soleil, elle,
reste celle de la vraie place : c'est elle qui fait la longueur de la queue.

`scene/ciel.test.ts` vérifie les quatre, de près puis depuis trois fois le plan
lointain. C'est lui qui a attrapé le passage dessiné à quatre millions d'unités,
sorti d'un vecteur de travail qui servait aussi de sortie.

### Les événements tombent n'importe où

Ils naissaient dans un cône autour du regard, pour une bonne raison : un champ de
soixante degrés sur trois cent soixante, c'est une chance sur six d'être vu, et
une étoile filante que personne ne voit n'est pas une étoile filante.

Mais une étoile filante qui tombe toujours devant celui qui regarde n'est pas un
ciel, c'est un spectacle. Et depuis qu'un succès récompense chaque événement, ce
succès ne valait rien, puisqu'on ne pouvait pas les manquer. Le tirage est donc
uniforme sur toute la sphère, par `randomDirection`, qui ne favorise aucun pôle,
là où un tirage indépendant en latitude et en longitude entasse les points aux
deux bouts de l'axe. Ce qui se passe dans le dos se passe quand même, et se perd.

Ce qui reste de l'ancienne précaution : les courses restent courtes. La traînée
et le passage tirent leur arrivée autour de leur départ plutôt que n'importe où
sur la sphère, sans quoi ils traverseraient le ciel entier en une seconde pour
l'une, quarante pour l'autre.

### Le trou noir

Le plus gros et le plus rare des événements du ciel. Une fois par session au
plus, et jamais dans les vingt premières minutes. Il ne touche à rien d'autre.

**Il arrive, il ne s'allume pas.** Neuf secondes pour paraître, une minute sur
place, seize pour s'en aller. Le départ est le plus long des trois, parce qu'un
départ aussi rapide que l'arrivée se lit comme un interrupteur. Il grandit du
cinquième de sa taille au plein, puis rapetisse, la taille un peu en avance sur
l'éclat : on voit d'abord quelque chose d'assez grand mais sombre, qui s'allume
ensuite. L'ordre inverse ressemblerait à une explosion. Chaque pièce a son
heure : l'ombre et son anneau de photons d'abord, qui sont l'objet, puis le
disque, le temps que le gaz tombe et chauffe. Au départ, le même ordre à
l'envers. Et la sortie traîne en racine plutôt que de tomber droit sur zéro, ce
qui laisse à l'œil le temps de le perdre au lieu de le voir disparaître.

Quatre pièces, chacune avec sa raison d'être là. **L'horizon** est une sphère.
Elle n'éclaire rien, tout son travail est d'écrire la profondeur, donc de cacher
ce qui passe derrière. **Le disque** est un vrai anneau posé dans un plan,
incliné au hasard à chaque fois, qui tourne plus vite au-dedans qu'au-dehors.
C'est lui qui donne le relief : sa moitié lointaine disparaît derrière la sphère
et ressort de l'autre côté. **L'anneau de photons** et **la couronne** restent
tournés vers l'œil, et c'est exact : la lumière qui a fait le tour de l'objet
ressort en cercle autour de l'ombre quel que soit le point de vue. La couronne ne
se montre que si le disque est vu de biais, puisqu'il faut du disque derrière
l'ombre pour qu'il y ait quelque chose à relever.

Il est **accroché au ciel**, haut au-dessus de la galaxie, à une cinquantaine de
degrés, dans une direction retenue une fois pour toutes. Les deux essais
précédents disent pourquoi. Posé à sa vraie place dans la galaxie, il se faisait
couper par le plan lointain dès qu'on s'éloignait. Rapporté sur la sphère du ciel
mais visé depuis un point fixe du monde, il glissait à travers le ciel dès qu'on
tournait autour d'un système, alors qu'il doit y être planté comme une étoile.
Une direction ne bouge pour personne. Ce qu'on perd, c'est de pouvoir s'en
approcher, mais un objet qu'on peut atteindre n'est plus un événement du ciel.

Son orientation est **choisie et non tirée au hasard** : la normale du disque est
le haut du monde ramené perpendiculaire à cette direction, puis penché d'une
quinzaine de degrés. Le plan du disque contient alors l'horizontale de l'écran,
son ellipse y est couchée, et la pente ouvre juste assez pour qu'on en voie le
dessus. Au hasard, il se dressait sur la tranche une fois sur deux. À plat et vu
de dessous, il n'était qu'une cible.

Deux pièges d'éclat, payés comptant. Les valeurs avaient été réglées **sans la
passe de débordement**, dont le seuil vaut 0,85 : à l'écran, l'objet était un
aplat blanc. Les grandes surfaces restent désormais sous le seuil et gardent leur
couleur, seul l'anneau de photons a le droit de le franchir. Et le mélange
additif multiplie déjà la couleur par l'opacité, donc fournir les deux revenait à
peindre au carré.

**Ce qui a été essayé puis retiré**, pour ne pas y revenir par le même chemin :

- **Avaler les systèmes un par un**, chaque étoile et chaque planète happée à son
  tour en spirale. Trente secondes de cérémonie qui tenaient la scène en otage et
  remuaient tout ce qu'elle porte, pour une chose qu'on voulait voir ailleurs.
- **Aspirer l'écran lui-même** par un filtre SVG posé sur la coque. L'idée tord
  bien l'application entière, boutons compris, pour une dizaine de millisecondes
  par image à condition que la région du filtre colle à la coque (140 % de
  marge : 36 ms ; 104 % : 13,3 ms, contre 12,1 ms au repos). Mais sa carte de
  déplacement tient sur huit bits, et c'est elle qui décide de tout : au-delà
  d'environ trois pixels d'écart entre deux niveaux voisins, l'image ne glisse
  plus, elle se gaufre. Tramer l'arrondi change les marches en grain et repousse
  la limite sans la lever.
- D'où le partage, **tourner d'un côté, rassembler de l'autre**. Un pixel qui
  tourne reste à sa distance du trou, donc à l'écran, tandis qu'un pixel qui
  glisse va chercher sa couleur hors de la fenêtre et vide l'image par les bords
  avant que rien n'ait été mangé. Le vissage par le filtre, le resserrement par
  une transformation CSS dont l'origine est le point lui-même, un filtre ne
  sachant pas rapprocher l'image entière d'un seul endroit.
- Deux pièges de coordonnées : le point d'arrivée se lit en coordonnées de mise
  en page, la coque étant elle-même en train de se resserrer dessus ; et la
  projection rend le point symétrique quand l'objet passe derrière l'œil.

Rien de tout cela n'est dans l'application. Le trou noir n'avale plus rien, et
c'est très bien ainsi.

### La supernova

Elle n'était qu'un point lumineux posé sur un carré tourné vers l'œil : un cœur,
un halo, quatre aigrettes, le tout dessiné en pixels d'écran. À côté du trou
noir, on voyait une lampe et une masse. Une explosion n'est pas une lumière au
loin. Ce qu'on en reconnaît, c'est que quelque chose **part**.

Trois pièces, et c'est leur ordre dans le temps qui fait l'explosion.
**L'éclair** reste le carré d'avant, cœur, halo et aigrettes, mais il n'est plus
toute l'affaire : il domine la première seconde puis s'éteint plus vite que le
reste, sans quoi l'ensemble se lit comme une lampe entourée de fumée. **L'onde de
choc** est une sphère qui enfle, dont on ne voit que le bord, parce qu'au bord le
regard prend la coquille en biais et rencontre bien plus de matière qu'en son
milieu. C'est pour cela qu'un rémanent se voit comme un anneau alors qu'il est
une sphère. **Les débris** sont une seconde coquille, plus lente, plus épaisse,
plus grumeleuse, parce qu'une explosion n'est pas propre et que des paquets
partent plus vite que d'autres.

Elle grandit comme la racine cinquième du temps au carré, la loi de Sedov et
Taylor, celle d'un souffle qui pousse le milieu autour de lui : très vite au
début, de plus en plus lentement ensuite. Une croissance régulière donnerait un
ballon qu'on gonfle. Mais cette loi seule sature : entre les deux tiers et la
fin, le rayon ne gagne plus que quinze pour cent, ce qui ne se voit pas, et le
dernier tiers devenait un grand cercle rouge arrêté qui attendait de s'éteindre.
Un second terme lui rend une vitesse à la fin : elle grandit encore pendant
qu'elle s'efface, et c'est ainsi qu'on la **perd de vue** au lieu de la voir
s'arrêter. `supernova.test.ts` tient la loi : elle ne recule jamais, elle est au
quart de sa taille à trois secondes, et elle gagne encore un tiers dans son
dernier tiers.

La montée d'éclat a demandé deux essais. Huit secondes donnaient une lampe qu'on
allume ; une seconde ne se voyait pas arriver du tout, l'image d'avant n'ayant
rien et celle d'après ayant tout. Deux secondes et demie, en accélérant, laissent
voir la chose **venir**. Le palier qui suit n'est pas de la physique, c'est le
temps de tourner la tête.

**Elle éclate à côté du regard, et non dedans.** Tirée comme les autres dans un
cône autour de l'axe de vue, elle tombait une fois sur deux juste devant le
système qu'on regardait, qu'on ne voyait alors plus du tout. Les petits
événements peuvent se le permettre, étant minces et durant trois secondes. Une
explosion large de vingt-sept degrés qui tient une minute, non. Elle se pose donc
entre vingt-quatre et trente-deux degrés de l'axe, de biais vers le haut. La
fenêtre est serrée des deux côtés : plus près elle couvre le système, plus loin
elle sort du cadre sur une fenêtre étroite, et un événement qu'on ne voit pas n'en
est pas un. `ciel.test.ts` le vérifie sur vingt tirages, projection à l'écran
comprise. L'image n'offre d'ailleurs qu'une trentaine de degrés vers le haut pour
un champ de soixante, contre une quarantaine sur les côtés : la place est de
côté, pas au-dessus.

Deux choses apprises à l'image. Un plafond d'opacité posé **avant** la force
écrasait tout le haut de la courbe : le bord de la coquille y arrivait partout,
les déchirures disparaissaient dans le plafond, et il n'en restait qu'un anneau
lisse. Et un bruit pris tel quel reste autour de sa moyenne, donc les deux faces
de la sphère se superposant en s'y moyennant encore, on obtenait une bulle de
savon. Tranché par `smoothstep`, il fait des trous, et c'est par les trous qu'on
voit que cela se déchire.

**Et elle ne laisse rien.** Une lueur restait accrochée au ciel jusqu'à la fin de
la session. C'était juste quand la supernova était un point. Elle ne l'est plus
du tout, donc ce qui restait était un grand cercle rouge immobile, planté dans un
coin du ciel pour toujours. Une explosion se disperse. La durée a suivi, de
soixante-dix secondes à cinquante-huit, avec une décroissance plus franche, la
moitié sombre et sans mouvement ne servant à personne.

### La musique des événements, et l'interrupteur qui les coupe

L'interrupteur est dans l'onglet Graphisme, sous « Ciel vivant », puisque c'est
un réglage de scène. Les musiques sont dans la carte Ambiance de l'onglet
Personnalisation, à côté de la musique de fond et de son volume, parce qu'elles
n'ont rien à faire parmi les réglages d'image.

**Événements du ciel** est un interrupteur à part. Il coupe les tirages, étoile
filante, tempête, comète, passage, supernova et trou noir, sans toucher au rideau
de gaz, qui reste sous « Ciel vivant ». On peut vouloir un ciel qui respire sans
que rien ne vienne traverser le regard pendant qu'on range sa bibliothèque. Le
panneau de débogage peut toujours les provoquer à la main.

**La musique se règle par événement** : supernova, comète bleue et trou noir ont
chacun la leur, et ces trois-là seulement. Les étoiles filantes reviennent toutes
les trente secondes, et une musique à chaque fois ne serait plus une annonce mais
du bruit. Elle entre et sort en fondu, s'arrête avec l'événement, et l'ambiance
se tait pendant ce temps comme elle le fait déjà pour le lecteur.

Les morceaux fournis vivent dans `features/evenements/pistes/` et sont ramassés à
la construction par `import.meta.glob`, donc déposer un fichier suffit à
l'ajouter, et un morceau est tiré au sort à chaque événement. L'utilisateur peut
aussi en choisir un sur sa machine : on n'en retient que le chemin, le fichier
reste où il est, et il passe par le protocole d'actifs de Tauri, dont la portée
couvre déjà `$HOME` et `$AUDIO`.

**Le volume se règle aussi par événement**, à côté du morceau, comme celui de
l'ambiance. Il ne se déduit plus du volume d'ambiance relevé de moitié, parce que
ce n'est pas un fond et qu'un réglage tiré d'un autre surprend toujours
quelqu'un. La valeur par défaut est exactement ce que donnait l'ancien calcul sur
une installation neuve, de sorte que rien ne change pour qui ne touche à rien.

Deux choses apprises en réparant ce qui ne marchait pas : un dialogue natif qui
échoue doit le dire, car avalé en silence le bouton paraissait mort ; et une
sonde `HEAD` sur un fichier statique ne prouve rien en développement, le serveur
rendant la page d'accueil avec un franc 200 pour tout chemin inconnu.

### Les succès

Sept, un par événement du ciel, du plus courant au plus rare. Ce sont des choses
rares, un trou noir se montrant une fois toutes les trente heures passées devant
la galaxie, et la seule façon de savoir qu'on les avait toutes vues était de s'en
souvenir.

**Vu, et non survenu.** L'événement tombe où il veut. Il ne compte que s'il est
resté **dans le champ de la caméra** assez longtemps pour qu'on le voie, trois
secondes. Une seule image suffisait, et c'était trop peu : en se déplaçant vite,
on décrochait le succès d'un événement passé dans un coin de l'écran sans l'avoir
remarqué. Le compte est cumulé plutôt que continu, parce que quitter la chose des
yeux une seconde pour y revenir, c'est la regarder. Il est plafonné aux deux
tiers de la vie de l'événement, sans quoi une étoile filante d'une seconde serait
impossible à décrocher. Et une image ne peut pas valoir plus d'un quart de
seconde, de sorte qu'un pas de temps démesuré, machine qui peine ou onglet resté
en arrière-plan, n'offre pas le succès d'un coup.

Tourné de l'autre côté, on le manque, et il ne reviendra pas. C'est ce qui donne
sa valeur au reste, et c'est pour cela que les événements ne naissent plus devant
le regard.

Le crochet est posé à l'affichage, et non aux endroits qui lancent les
événements. La raison est bête et décisive : il y a deux chemins par événement,
le tirage au sort et le panneau de débogage, et poser le crochet sur les deux,
c'est en oublier un. Le signalement répété ne coûte rien, le module rendant faux
pour un succès déjà décroché. C'est ce qui permet à la scène de signaler
bêtement ce qu'elle montre sans retenir ce qu'elle a déjà signalé, et c'est la
première chose que vérifie `succes.test.ts`.

La notification est montée au niveau de l'application et non de la galaxie, parce
qu'un succès peut tomber pendant qu'on la regarde et doit se voir même si l'on
vient d'en partir. Elle tient sept secondes, contre trois ou quatre pour un
toast : il y a un nom et une explication à lire, et cela n'arrive que sept fois
dans la vie d'une installation.

**Le petit air est synthétisé**, calculé à la volée plutôt que lu dans un
fichier. Quelques centaines de kilo-octets pour une seconde de son qu'on entend
sept fois seraient chers payés, et une note calculée ne pose aucune question de
licence ni de chargement.

Le premier essai, trois triangles montant à 1320 Hz, était perçant et sonnait
jouet. Ce qui a changé : une quinte plus bas ; des cloches plutôt que des
triangles, c'est-à-dire une fondamentale et deux partiels qui s'éteignent plus
vite qu'elle, car c'est cette extinction inégale et rien d'autre qui fait le
timbre ; une basse une octave sous la phrase pour le poids ; un écho unique à
140 ms, parce qu'un son qui s'arrête net sonne comme une erreur ; et un
dédoublement désaccordé de six centièmes de ton sur la dernière note, dont le
battement lent la fait briller. Mesuré au rendu hors ligne, le centre de gravité
spectral tombe de 1867 à 626 Hz, une octave et demie plus bas, crête à 0,46 sans
saturation.

L'extinction est une **constante de temps**, et non une rampe jusqu'à zéro. Une
rampe exponentielle vers une valeur presque nulle tombe en ligne droite vers sa
cible : mesurée, elle ne laissait plus rien au bout de trois cents
millisecondes, et la note longue s'arrêtait avec les autres. Une constante de
temps décroît toujours dans la même proportion, c'est ainsi que s'éteint tout ce
qui résonne, et la queue tient maintenant 1,9 s.

**Un onglet des paramètres les montre**, décrochés et manquants : le journal des
observations, un registre de bord plutôt qu'une liste de trophées. Numéro,
intitulé, filet de conduite, verdict. Rien n'y est caché, parce que le nom d'une
observation dit ce qu'il y a à voir, et le masquer ne ferait pas un mystère,
seulement une liste de cases vides. La jauge est segmentée, un bloc par
observation : un bloc qui s'allume veut dire quelque chose, une barre qui avance
de quatorze pour cent, non.

**Ils survivent à l'application**, et c'était à un cheveu de ne pas être vrai. Le
stockage n'est rempli qu'une fois `initStorage()` revenu, et les modules sont
évalués avant la première ligne de `main.tsx`. Lire la liste au chargement du
module donnait un ensemble vide à chaque lancement, perdant les succès de la
veille, et le premier succès du jour les effaçait pour de bon en réécrivant la
liste. Elle est donc relue au premier accès, qui vient de la scène ou de
l'interface, donc bien après. `succes.test.ts` tient la garantie en rechargeant
le module avant d'écrire dans le stockage.

### La caméra, d'un système à l'autre

Elle allait trop vite, regardait n'importe où, et arrivait sur un système vu de
dessus. Trois décisions distinctes étaient en cause.

**Le regard allait tout droit pendant que la caméra montait.** C'était le pire
des trois. La position suivait un arc qui s'élevait haut au-dessus du disque,
ce qui donne au voyage son mouvement de recul, mais le point visé était
interpolé en ligne droite d'un centre de système à l'autre et ne s'élevait
jamais. À mi-parcours, la caméra surplombait une cible restée en bas, presque à
sa verticale : soixante-trois degrés de plongée, mesurés. On traversait la
galaxie en regardant le sol.

Le regard a donc son propre arc. Il monte presque autant que la caméra, et la
petite différence qui reste est exactement ce qui fait l'inclinaison vers le bas.
Surtout, il devance : son point de contrôle est aux quatre cinquièmes du chemin,
de sorte qu'à mi-parcours il a fait 61 % de la route quand la caméra n'en est
qu'à la moitié. On survole en regardant où l'on va, et le système d'arrivée entre
dans le champ bien avant qu'on y soit. Résultat mesuré : l'angle de plongée ne
s'écarte plus de plus d'un degré de celui du cadrage d'arrivée sur toute la
traversée. `flightPath.test.ts` le tient.

**Le cadrage d'arrivée passe de 48° à 30°** au-dessus du plan des orbites. De
haut, on regardait une carte : des cercles posés à plat, toutes les planètes à la
même distance apparente. À trente degrés, les orbites redeviennent des ellipses,
les planètes passent devant et derrière leur soleil, et le système retrouve une
profondeur. La distance suit, 1,22 fois le cadre contre 1,42, parce qu'à cette
élévation c'est la largeur du système qui commande le cadrage, et elle ne change
pas quand on s'abaisse, là où sa hauteur apparente diminue.

**Les durées** passent de 1,6 à 3,4 s à 2,4 à 4,5 s, puis à 3,2 à 6 s. L'arc
s'élève de 30 % de la distance au lieu de 45.

**La courbe** est un lissage quintique (`6t⁵ − 15t⁴ + 10t³`) partout, au lieu
d'une cubique. Sa vitesse et son accélération sont nulles aux deux bouts, là où
la cubique n'annulait que la vitesse, et c'est précisément ce qui enlève le petit
à-coup au démarrage et à l'arrivée, parce que l'œil ne suit pas une position mais
une vitesse, et qu'une vitesse qui apparaît d'un coup se voit.

### La vitesse du clavier suivait le mauvais système

Le déplacement libre est rapporté au cadrage plutôt qu'exprimé en unités
absolues, parce qu'une bibliothèque de deux cents jeux s'étend sur des milliers
d'unités et une de trois sur quelques dizaines, et qu'une vitesse fixe serait
inutilisable dans l'un ou l'autre cas. Mais ce cadrage était celui du système
courant **au montage de la scène**, et rien ne le remettait à jour. On voyageait
vers un launcher plus grand ou plus petit et la vitesse restait celle d'avant,
d'où l'impression de ramper dans un système vaste, ou de le traverser d'une
pression dans un petit.

La vitesse se rapporte maintenant au système dont on est **le plus près**, relu à
chaque image. C'est une autre grandeur que celle du système **désigné**, qui sert
à calculer la durée d'un voyage et doit rester celle de la destination tout du
long, donc les deux portent deux noms. La portée des étiquettes suit la même
règle, pour la même raison.

### Les systèmes vus de très loin

En reculant, les planètes se libéraient, ce qui est voulu, les soleils tenaient
encore un moment, puis s'éteignaient un à un. On reculait pour embrasser la
galaxie entière, et la galaxie disparaissait.

La cause n'était pas la taille apparente. Des balises existaient déjà pour ça, un
point lumineux par soleil, à taille fixe en pixels. C'était le **plan lointain de
la caméra**, à vingt mille unités, au-delà desquelles rien n'est dessiné. Sur une
bibliothèque de sept launchers, les systèmes de l'autre bout passent dessous dès
qu'on prend du recul, et leur balise avec, puisqu'elle vivait à leur place
exacte.

Les balises sont donc **rapportées sur une sphère autour de l'œil** quand elles
sont plus loin que douze mille unités : même direction, donc même place dans le
ciel, à une distance que la caméra sait voir. En deçà du seuil, la balise reste
exactement sur son soleil, puisque c'est lui qu'on vise pour s'y rendre, et un
repère décalé mentirait.

**Et elles rapetissent avec la distance**, ce que la première version ne faisait
pas. Leur taille était fixe, vingt-six pixels, pour les sauver de la disparition,
ce qui en faisait sept ballons lumineux suspendus dans un champ d'étoiles fines
dès qu'on prenait du recul. Une atténuation ordinaire ferait l'inverse et les
effacerait. D'où une décroissance en `1/d`, celle de la perspective, bornée aux
deux bouts : jamais plus grosse que de près, jamais plus fine qu'une étoile du
fond. Réglée sur ce qu'on veut voir plutôt que sur une formule : huit pixels à
quatre mille unités, le plancher au-delà de onze mille. Autrement dit, dès qu'un
système cesse de se lire comme un système, sa balise est une étoile.

La taille varie d'une balise à l'autre, ce que `PointsMaterial` ne sait pas
faire, sa taille étant un uniforme partagé par tout l'objet. D'où une quinzaine
de lignes de shader, qui ne coûtent rien, la galaxie n'ayant qu'une poignée de
soleils et cela restant un seul appel de dessin. Un piège au passage :
`gl_PointSize` compte en pixels d'écran et non d'interface, et il faut donc le
multiplier par la densité de pixels, ce que `PointsMaterial` faisait dans notre
dos.

**Et les noms se taisent au même seuil.** De si loin, un système n'est plus qu'un
point lumineux parmi d'autres. Son nom n'a plus rien à désigner, et sept
étiquettes suspendues dans le vide font une liste, pas une galaxie. Les deux
changements partagent un seuil, de sorte qu'il n'y a qu'une chose à comprendre :
en deçà, un système avec son nom ; au-delà, une étoile.

### Le mouvement de l'interface

Fait sans bibliothèque. Une règle, et tout le reste en découle : rien ne bouge à
vitesse constante. Un objet qui démarre et s'arrête net n'existe pas, et l'œil le
sait.

Framer Motion n'est pas installé, et l'ajouter coûterait une cinquantaine de
kilo-octets plus un calcul en JavaScript à chaque image, ce qui est cher pour un
bouton qui s'enfonce dans une application qui fait déjà tourner une galaxie. Le
navigateur sait le faire seul depuis que `linear()` accepte une liste de points :
on y échantillonne la vraie courbe d'un ressort, la solution de
`m·x″ + c·x′ + k·x = 0`, prise en trente-six points, et le moteur interpole. Même
mouvement, zéro octet, zéro image de calcul, et cela marche aussi dans une
transition.

Trois ressorts, et leur durée est celle qu'il leur faut pour se taire plutôt
qu'un chiffre rond. **100/15** pour ce qui paraît, qui dépasse sa cible de 2,8 %
avant de revenir, et c'est ce débordement qui se lit comme organique plutôt que
glissé. **320/30** pour ce qu'on touche, presque sans dépassement, parce qu'un
bouton qui rebondit sous le doigt a l'air cassé. **180/26**, critique, pour ce
qui s'en va et pour les couleurs.

**La cascade** décale chaque élément d'un vingtième de seconde sur le précédent :
cartes des paramètres, journal des observations, liste des jeux, grille de la
bibliothèque, notes de version. Le rang vient du CSS plutôt que du JSX, et il est
plafonné au onzième. Sans ce plafond, une bibliothèque de quarante jeux ferait
attendre deux secondes à la dernière vignette, et une cascade qu'on attend n'est
plus une cascade.

**Une difficulté de cascade CSS, et deux spécificités pour la résoudre.**
`transition` est une propriété unique : la règle qui l'emporte prend toute la
liste, et on ne peut pas y ajouter une ligne. Les modules déclarent déjà leurs
transitions avec une classe, donc une règle à spécificité nulle aurait été
écrasée et le survol aurait sauté au lieu de ressortir. La déclaration de
transition passe donc au-dessus et reprend à son compte ce que les modules
animaient, vérifié avant d'écrire, les deux seules transitions de largeur du
dépôt étant des barres de progression. Le mouvement lui-même, en revanche, reste
à spécificité nulle, parce que plusieurs composants ont déjà leur geste à eux, la
fiche de jeu soulevant son bouton de lecture, et les écraser tous par un même
1,02 aurait appauvri l'interface au lieu de la soigner.

Un dernier détail qui compte : couper les animations ne se fait pas avec
`animation: none`, qui laisserait les éléments à leur état de départ,
c'est-à-dire transparents. La durée est écourtée à un millième de milliseconde.
Plus rien ne bouge, tout reste visible.

### Les jaquettes et le réseau

Sans wifi, les jaquettes ne se chargeaient pas, ce qui est normal. Ce qui ne
l'était pas : au retour du réseau, elles ne revenaient plus, même en actualisant
la bibliothèque. Il fallait relancer l'application.

La cause tenait en une ligne. Un échec de chargement était retenu comme « ce jeu
n'a pas de jaquette », dans un ensemble gardé pour toute la session. Hors ligne,
c'est toute la bibliothèque qui y entrait d'un coup, et plus personne ne
redemandait rien. Pire pour les jeux Steam : l'adresse du CDN se calcule sans
réseau, l'image échouait faute de réseau, l'affichage en concluait que Valve
n'avait pas d'image, et le service **jetait du cache persistant une adresse
parfaitement valable**. Une coupure coûtait donc des jaquettes jusqu'au prochain
lancement.

Trois réparations. Côté natif, `sgdb_search_and_fetch` ne confond plus « le
fournisseur a répondu, il n'a rien » et « je n'ai pas pu le joindre » : la
première rend `Ok(None)`, la seconde une erreur, là où `.ok()?` écrasait les deux
en « rien trouvé ». Côté service, on ne retient que la première, et sans réseau
on ne demande même pas. Côté affichage, une image qui échoue hors ligne ne
déclenche plus la chaîne de repli qui vidait le cache.

Et au retour du réseau, tout repart tout seul : les échecs retenus sont oubliés,
et chaque vignette porte **l'époque du réseau** où elle a été résolue. L'époque
change, l'étiquette ne correspond plus, la chaîne recommence. Étiqueter plutôt
que remettre à zéro dans un effet, c'est le motif qu'employait déjà la fiche de
jeu pour l'identifiant, et il évite le rendu en cascade que ce dépôt interdit.

**Reste à savoir qu'il n'y a plus de réseau, et c'est là que la première version
s'est trompée.** Elle s'en remettait à `navigator.onLine`, juste dans un
navigateur, faux dans l'application. WebView2 le laisse à `true` quand on coupe
le wifi et n'émet aucun événement `offline`, donc l'application ne voyait ni la
coupure ni le retour, exactement ce qu'on cherchait à réparer.

Deux voix, donc, comme pour l'état de la fenêtre et pour la même raison. Le
moteur web répond vite et sans rien demander à personne, et sert dans un
navigateur ordinaire. Le natif va voir : il interroge l'adresse que Windows
interroge pour allumer son propre voyant « pas d'Internet », et le contenu de la
réponse compte autant que son statut, un portail captif répondant 200 avec sa
propre page, ce qui est bien une absence d'Internet pour qui cherche une
jaquette. Le natif a le dernier mot.

La sonde coûte un aller-retour, vingt-deux octets mesurés à 300 ms, donc elle se
rationne : toutes les dix secondes quand on se croit coupé, le retour devant se
voir vite ; toutes les trente quand tout va bien ; jamais quand la fenêtre n'est
pas devant l'utilisateur ; et tout de suite quand une jaquette vient d'échouer.
Ce dernier cas est le signal le plus sûr de tous, puisqu'on vient d'essayer et que
ça n'est pas passé.

**Un bandeau le dit**, en haut et au milieu, sous les en-têtes : « Hors ligne,
les jaquettes manquantes se chargeront au retour du réseau ». Il annonce aussi ce
qui va se passer, parce qu'un avertissement qui ne dit que le problème laisse
chercher une manœuvre qui n'existe pas.

### L'onglet Graphisme, rangé comme un menu de jeu

Il portait quatre réglages maison, « finesse de l'image » sur un curseur de 1 à
2, « densité du ciel » sur un autre, et deux interrupteurs, dont aucun ne disait
rien à personne. Les menus graphiques ont pourtant un vocabulaire commun, vieux
de vingt ans et compris de tous : un préréglage, une échelle de rendu, une limite
d'images, et le détail pour qui veut y toucher.

**Le préréglage d'abord**, Bas, Moyen, Élevé, Ultra, parce que c'est la seule
chose dont a besoin celui qui ne sait pas ce qu'est un débordement lumineux : il
essaie Bas et voit si cela tourne mieux. Il **n'est pas stocké** : il se déduit
des valeurs, ce qui supprime d'un coup toute la classe de bogues où l'étiquette
dit Élevé pendant que les réglages disent autre chose. Toucher à n'importe quoi
le fait tomber sur Personnalisé, tout seul.

**L'échelle de rendu** remplace la finesse et dit enfin ce qu'elle fait : la part
de la résolution de l'écran à laquelle la scène est dessinée, de 50 à 200 %.
Au-dessus de 100 %, c'est du suréchantillonnage. L'ancienne finesse était un
plafond de densité de pixels qui, sur la plupart des écrans, ne changeait rien du
tout, donc les installations existantes repartent de 100 %, c'est-à-dire de ce
qu'elles avaient déjà. Le plafond interne à trois est une sécurité : sur un écran
à deux pixels par point, 200 % demanderait seize fois les pixels de base.

**La limite d'images par seconde** est nouvelle, et c'est le réglage le plus
utile de la liste sur un portable : au-delà de ce qu'on veut, chaque image est du
travail que personne ne verra. Elle saute l'image sans toucher à l'horloge, de
sorte que la scène avance exactement de ce qu'elle doit quand on la dessine
enfin. À savoir, et c'est écrit dans `cadence.ts` : sauter des images ne peut
donner que des sous-multiples de la cadence de l'écran, donc 144 Hz limité à 60
donne 48. C'est le prix de la régularité.

**Le compteur d'images** devient un réglage au lieu d'être toujours là. C'était
un outil de mesure allumé chez tout le monde.

Enfin, ce qui n'est pas du graphisme est sorti de la carte. « Ciel vivant » et
« Événements du ciel » décident de ce qui se passe dans le ciel, pas de la façon
dont on le dessine, donc ils ont leur propre carte, « Ambiance de la scène ».

### Les musiques du décor se taisent quand la fenêtre n'est plus devant. Le lecteur, non

L'ambiance se coupait déjà quand la fenêtre quittait l'écran, mais « quitter
l'écran » ne couvrait que deux cas : réduite dans la barre des tâches, ou repliée
dans la zone de notification. Une fenêtre **recouverte par une autre
application** n'est ni l'un ni l'autre. Le moteur web la dit visible, le natif
aussi, et ils ont raison tous les deux. Elle n'est simplement plus devant.

`etatFenetre` écoute donc une troisième voix, le focus, et son verdict n'est plus
« masquée » mais « en arrière-plan ». Le natif garde le dernier mot sur ce que le
moteur web croit voir, mais pas sur le focus, qu'il ne connaît pas : une fenêtre
peut être à l'écran, entière, et derrière celle d'une autre application.

**Deux musiques y sont abonnées, et non trois.** L'ambiance depuis `AppLayout`,
la musique des événements dans son module, chacune au plus près de ce qu'elle a à
mettre en pause. Ni l'une ni l'autre n'a été demandée par personne : elles
accompagnent une galaxie qu'on regarde, et on ne la regarde plus. Aucune ne fait
de fondu en partant, parce qu'un alt-tab doit couper tout de suite.

Le lecteur, lui, continue. Il avait été abonné comme les deux autres, au motif
qu'on peut vouloir couper sa musique en lançant un jeu. Mais une piste qu'on a
mise soi-même est une décision, et l'arrêter revient à décider à sa place qu'il
n'en veut plus dès qu'il ouvre une autre fenêtre. Le reste de l'application
tenait déjà cette règle pour acquise : le menu de la zone de notification porte
« lecture / pause » et « arrêter la musique », et le commentaire de
`set_tray_music` dit pourquoi, réduit, c'est le seul endroit d'où l'on peut
encore taire le lecteur. Deux entrées qui ne commandaient rien, puisque la
lecture s'était arrêtée d'elle-même en se réduisant.

### Désinstaller un jeu Epic retirait le launcher Epic

Le dossier d'installation était tenu pour le signe le plus sûr, deux jeux pouvant
porter des noms proches mais jamais le même dossier. C'était vrai, mais la
comparaison acceptait aussi un dossier qui **contenait** celui du jeu, et un
launcher est précisément ce qui s'installe au-dessus de ses jeux. Le registre
donne `C:\Program Files\Epic Games\` à Epic Games Launcher, chaque jeu Epic est
dedans, et la ressemblance valait donc cent sur cent, la meilleure note possible,
devant l'entrée du jeu lui-même. Vérifié sur la machine plutôt que déduit : les
deux jeux Epic installés tombaient tous les deux sur le désinstalleur du
launcher, un `MsiExec /X{…}` qui retire le launcher et rien d'autre. Ubisoft
Connect et HoYoPlay tendaient le même piège.

Seul le **même** dossier compte désormais, aux séparateurs et à la barre finale
près, le registre écrivant les deux formes. L'autre direction est partie avec :
un dossier contenu dans celui du jeu, c'est un composant installé à côté du jeu,
pas le jeu. Les deux ne servaient qu'à rattraper un nom différent, ce que la
règle du nom exact fait déjà quand elle est sûre.

Deux gardes de plus, parce qu'une action irréversible mérite d'être tenue deux
fois. Un **launcher ne peut plus répondre à la place d'un de ses jeux** : les
lanceurs connus sont écartés à l'entrée, à moins que ce soit bien le launcher
qu'on ait demandé à retirer. Et la **confirmation nomme ce qui va s'ouvrir**
quand ce n'est pas le nom du jeu. Le désinstalleur était cherché avant d'agir
précisément pour l'annoncer, le commentaire le disait, et la phrase reprenait le
titre du jeu. On lisait « Désinstaller Fortnite ? », et c'était le launcher qui
partait.

Un jeu Epic n'a pas d'entrée à lui dans le registre, donc le message renvoie
maintenant au launcher qui l'a installé, seul à savoir le retirer.

### Les paramètres au vocabulaire du tableau de bord

L'application avait déjà son langage, `--hud` et ses filets, les crochets
d'angle, la trame de balayage, la chasse fixe des compteurs, tout cela dans
`App.css`. Le cadre des paramètres s'en servait, leur contenu non. On ouvrait un
cockpit et on tombait sur des boutons, des pastilles et un menu blanc qui
auraient pu venir de n'importe quelle application.

Ce qui a changé, et pourquoi. Les **boutons** prennent la chasse fixe, les
capitales espacées, la trame en fond, et s'allument d'un halo au survol au lieu
d'éclaircir leur fond, parce qu'un bouton de tableau de bord est gravé, pas
peint. Les **curseurs** deviennent des règles graduées avec une manette qui
coulisse, le curseur natif étant exactement le même dans toutes les applications
du monde. Les **titres de carte** portent le filet segmenté de l'en-tête du
panneau, qui court jusqu'au bord, parce que c'est cette ligne plus que la couleur
qui fait d'un titre l'étiquette d'un instrument. Les **pastilles de couleur**
deviennent des plaquettes carrées, un sélecteur de voie et non une palette de
peinture. Les **champs et les menus** passent sur vitre sombre.

Deux choses apprises. Un `<select>` habillé reste peint par Windows tant qu'on ne
lui ôte pas son apparence native, et il était resté blanc malgré ses couleurs, ce
qui était la première chose que l'œil trouvait dans le panneau ; le chevron
devient alors à notre charge. Et la chasse fixe est une police de **nombres** :
mise dans un menu, « Français » finissait coupé en « Franç ». Le partage que fait
déjà le reste de l'application, Chakra Petch pour les mots et Share Tech Mono
pour les valeurs, est le bon.

Rien de tout cela n'invente de couleur ni de jeton. Les mêmes `--hud-*` dans les
deux thèmes, et le thème clair suit sans une ligne de plus.

### Les tags

Chaque jeu porte des tags posés à la main, depuis la fiche du système solaire
comme depuis la grille de la bibliothèque : six tags proposés et autant de tags
libres qu'on veut, douze au plus par jeu, vingt-quatre caractères chacun. Les
tags proposés sont rangés sous un identifiant et affichés traduits, donc changer
la langue ne fige pas un « En cours » dans une interface anglaise. Les tags
libres restent tels qu'on les a écrits. Les doublons ne tiennent pas compte de la
casse.

Ce sont des données de l'utilisateur : un scan ne les touche jamais, et deux
copies d'un même jeu sur deux launchers réunissent leurs tags à la déduplication
(`services/tags.ts`, vérifié hors navigateur).

Trois usages. Un filtre par tag dans la barre de la bibliothèque, avec le nombre
de jeux par tag, gardé dans l'adresse. Des puces de filtre sous la recherche du
système solaire, qui ne proposent que les tags portés par les jeux du système
affiché. Et un système solaire alimenté par un tag, décrit plus haut.

### Thème sombre et clair

Paramètres, Personnalisation, Thème : sombre, clair, ou système, qui suit Windows
à chaud. Le thème se pose en `data-theme` sur `<html>` avant la peinture, et
`App.css` y redéfinit les jetons. Quatre jetons s'ajoutent à la famille `--hud` :
l'encre pour les textes et les reflets, le fond pour les vitres et les panneaux,
l'ombre pour le halo derrière un texte, et le voile sur l'image de fond, plus un
jeton de vivacité pour la part d'une couleur vive dans un texte coloré. Les
quelque 230 couleurs écrites en dur dans les feuilles de style ont été converties
vers ces jetons par un script, puis relues à la main.

L'espace reste noir dans les deux thèmes, parce que c'est le ciel et non
l'interface. Ce qui s'y pose sans vitre, le logo et les étiquettes des planètes,
porte une classe qui rétablit les couleurs du sombre, et les voiles sous les
panneaux restent sombres. En clair, l'accent par défaut, un blanc cassé, prend le
bleu de la structure, et un accent trop clair est assombri en gardant sa teinte
jusqu'au seuil AA. Contrastes mesurés écran par écran : tout le texte actif passe
4,5 en clair.

### Xbox et Microsoft Store

Fait, et sans élévation, ce qui était la difficulté annoncée puisque
`WindowsApps` reste illisible. `xbox_scan.rs` croise deux sources : les dossiers
`XboxGames` de chaque disque, où chaque jeu porte un `MicrosoftGame.Config` avec
l'identité du paquet, le titre affiché et les logos, plus un `appxmanifest.xml`
qui nomme l'application à lancer ; et l'inventaire des paquets du registre
utilisateur, qui donne le nom complet du paquet. De ce nom se déduit la famille,
d'où la cible `shell:AppsFolder\<famille>!<application>`, vérifiée auprès du
shell et correspondant exactement à ce que Windows attend.

Cette forme de cible n'est ni une URL ni un chemin. Elle est validée caractère
par caractère, côté Rust avant lancement **et** à la relecture de la
bibliothèque. Ce second contrôle manquait d'abord et effaçait la cible à chaque
démarrage, laissant le bouton Jouer sans rien à lancer.

Ces jeux n'existent dans aucun catalogue de jaquettes, donc Cassini affiche le
logo que le jeu porte lui-même, lu dans son dossier. Et comme aucun exécutable ne
peut donner une icône de launcher, `store_icons.rs` demande au shell celle de
l'application Xbox, la même que dans le menu Démarrer, prise sur la machine, avec
un dessin livré en secours.

La désinstallation manque encore. Windows la réserve à ses propres Paramètres.

### Raccourcis clavier

Le déplacement dans la scène reste à la scène : WASD et ZQSD, touches et
sensibilité configurables dans `lib/flyKeys.ts`, effectifs seulement quand la vue
a le focus. Tout le reste passe par une écoute unique, dans `SolarSystemPage`.
Répartis entre plusieurs composants, les raccourcis finissaient par se marcher
dessus et personne ne pouvait dire lesquels existaient.

`1` à `9` mènent au système correspondant de la barre, launchers puis systèmes
personnalisés. `Ctrl+F` ramène la recherche sous la main, `F` bascule le favori
du jeu choisi, `?` ouvre la liste des raccourcis, `Échap` ferme ce qui est
ouvert. `Ctrl+,` et `Ctrl+M` restent portés par les calques, `Espace` par le
lecteur.

Deux précautions. Rien ne se déclenche pendant qu'on tape : un champ de saisie ou
une zone éditable garde la main, sans quoi écrire « favori » dans la recherche
basculerait huit fois le favori du jeu choisi. Seul `Ctrl+F` traverse, pour
revenir à la recherche depuis n'importe où. Et les chiffres sont lus par `e.code`
et non `e.key`, parce que sur un clavier AZERTY la rangée du haut produit des
symboles.

`AideRaccourcis` est la seule page où ils sont tous. Les touches de déplacement
n'y sont pas recopiées, puisqu'elles se règlent et qu'une seconde source de
vérité finit toujours par mentir. La liste renvoie au panneau Commandes, qui les
affiche.

### Accessibilité

Un audit a été mené sur l'ensemble de l'application, puis corrigé. La langue du
document suit désormais celle de l'interface, là où la page se déclarait
anglaise. Les notifications sont annoncées par une région `aria-live`, avec
`role="alert"` pour les erreurs. Les fenêtres retiennent la tabulation et rendent
le focus à son point de départ (`hooks/useFocus.ts`), Échap ferme partout, et le
contour de focus qu'annulaient trois feuilles est rendu.

Les contrastes ont été mesurés et corrigés : la liste passait sous 2,5 dès qu'une
planète claire défilait derrière elle. Son fond est monté de 0,34 à 0,80 et les
opacités faibles à 0,62–0,9, et plus aucun texte n'est sous 11 px. Le pire cas
mesuré est passé de 1,35 à 5,40, pour un seuil AA à 4,5.

Le mouvement réduit est respecté. Une règle globale dans `App.css` couvre les
seize feuilles qui l'ignoraient, et la scène 3D, que le CSS ne peut pas
atteindre, fige orbites, rotations et voyages de caméra quand le système le
demande.

Trois courses réglables étaient de simples `div` à l'écoute de la souris : la
progression et le volume du lecteur, et le fil du bandeau du bas. Invisibles pour
un lecteur d'écran, hors d'atteinte au clavier. Elles passent par
`components/Glissiere`, qui porte `role="slider"`, le nom, la valeur et sa
lecture en clair (« 1:23 sur 4:10 » plutôt que « 33 »), les flèches, Origine et
Fin, et un contour de focus, sans changer un pixel de ce qu'on voit.

Un second audit a été mené avec axe-core sur neuf vues, et a trouvé vingt
violations. Dix-huit venaient d'un seul défaut : `SettingRow` affichait son
libellé dans un `div` avec le contrôle à côté et rien qui relie les deux, donc
neuf menus déroulants et onze cases ou curseurs n'avaient aucun nom accessible.
Chaque contrôle porte maintenant la clé i18n que sa ligne affiche déjà.
`FilterSelect` avait bien un `<label>`, mais flottant, sans `htmlFor`, ce qui
touchait six menus de la bibliothèque et des launchers. Et le visualiseur de
musique couvre l'écran d'un canvas décoratif qui n'apparaissait dans l'arbre
d'accessibilité que comme un bloc de contenu hors de tout repère.

Le parcours clavier en a trouvé un de plus, qu'axe n'a pas signalé : le bouton
d'un jeu tirait son nom de son contenu recollé et s'annonçait « 1Portal 212,0
Go ». Il porte maintenant un nom composé, et les trois éléments purement visuels
qui s'y mêlaient, le numéro d'orbite, l'initiale de la vignette de repli et
l'étoile des favoris, sont marqués décoratifs.

Ce qui va déjà bien, mesuré plutôt que supposé : treize arrêts au clavier sur la
galaxie, tous nommés, tous avec un anneau de focus visible ; le calque des
paramètres est un `dialog` avec `aria-modal`, le focus y reste piégé sur
vingt-cinq tabulations et Échap le ferme ; et les dix contrastes du HUD, qu'axe
renonce à calculer parce que les panneaux peignent leur fond avec des
pseudo-éléments, mesurés en composant les couches jusqu'au ciel noir, le plus
faible étant à 7,43 pour un seuil de 4,5.

Une exception assumée. `label-content-name-mismatch` signale les trois boutons de
jeu, parce que le numéro d'orbite et l'initiale de la vignette restent visibles à
l'œil sans figurer dans le nom. La règle existe pour qu'un utilisateur à la voix
puisse dire ce qu'il lit. Ici ce qu'il lit n'est pas un libellé mais de la
décoration adjacente, et le mettre dans le nom rendrait « 1, P, Portal 2, 12,0
Go » à qui écoute. Le confort d'écoute l'emporte.

Reste à faire : exposer dans les Paramètres la taille du texte et l'opacité de la
liste, dont la plomberie existe mais n'est pilotée que par le panneau de
débogage ; prendre en compte `prefers-contrast` ; et éprouver la mise en page à
200 % de zoom.

### Sécurité

Une revue a été menée sur toute la surface exposée. La politique de contenu est
stricte : `default-src 'self'`, `script-src 'self'` sans `unsafe-inline` ni
`eval`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, et
une liste nommée d'hôtes d'images. Le protocole `asset:` est borné au profil
utilisateur, avec un refus explicite de `.ssh`, `.aws`, `.gnupg` et des magasins
d'identifiants de Windows. Les permissions Tauri n'ouvrent que sept schémas
d'URL et treize exécutables de launcher, nommés un par un.

Côté Rust, les trente-cinq commandes ont été reprises une à une. Toutes celles
qui reçoivent un chemin le valident avant de s'en servir : confinement sous la
racine musique pour ce qui écrit, sous le profil utilisateur pour ce qui lit, et
résolution canonique des `..` et des liens. `launch_target` n'accepte qu'un des
cinq schémas connus ou un chemin local existant sur une lettre de lecteur, donc
ni UNC, ni `..`, ni caractère de contrôle. Rien ne passe plus par `cmd /c start`,
qui reparsait `&` et `|`. Voir `security.rs` et ses quatre tests.

Côté JavaScript, aucun `dangerouslySetInnerHTML`, aucun `eval`, aucune
construction de fonction, et le seul `innerHTML` est un vidage. La clé
SteamGridDB reste dans le gestionnaire d'identifiants Windows et ne traverse
jamais le JavaScript. Les mises à jour sont signées avec minisign et l'index est
public.

Corrigé au passage : `react-router-dom` traînait deux alertes de gravité haute
(7.13.0 à 7.18.3, `npm audit` à zéro désormais). Les cinq avis concernaient le
rendu côté serveur, que cette application n'utilise pas, mais un correctif mineur
ne se discute pas.

**Dépendances Rust.** `cargo audit` passe les 690 entrées du verrou. Huit alertes
au premier passage, sept levées par une mise à jour du seul fichier de
verrouillage, sans changement de code, cinq versions déplacées :

- `rustls-webpki` 0.103.10 à 0.103.15. La plus sérieuse, puisque c'est la
  bibliothèque qui valide les certificats de la mise à jour automatique. Trois
  avis : contraintes de nom acceptées à tort pour des URI, contraintes acceptées
  pour un certificat générique, et une panique atteignable en lisant une liste de
  révocation.
- `h2` 0.4.14 à 0.4.19. Trames DATA vides sans borne, sur le chemin HTTP/2 de
  `reqwest`, celui qui interroge iTunes et SteamGridDB.
- `quick-xml` 0.38.4 à 0.41.0, via `plist` 1.8.0 à 1.10.0. Deux alertes de
  gravité 7,5 : temps quadratique sur les attributs en double, et allocation sans
  borne des déclarations d'espace de noms. `plist` ne se compile que sur macOS et
  la version publiée est Windows, donc l'exposition réelle était nulle, mais la
  contrainte `^0.38` de `plist` interdisait de bouger, et 1.10 la lève.
- `crossbeam-epoch` 0.9.18 à 0.9.21. Déréférencement de pointeur invalide dans un
  affichage de mise au point, via `rayon` et le décodeur d'images `exr`.

La huitième reste, et c'est un faux positif. `rkyv` 0.7.46 est une dépendance
**optionnelle** de `rust_decimal`, lui-même tiré par `byte-unit` puis
`tauri-plugin-log`. La fonctionnalité n'est pas activée, `cargo tree -i rkyv` ne
renvoie rien toutes cibles et tous types d'arêtes confondus, donc le code n'est
jamais compilé. `cargo audit` lit le fichier de verrouillage, où figurent aussi
les dépendances optionnelles.

Restent seize avertissements « non maintenu » ou « non sûr » (`paste`, `fxhash`,
les `unic-*`, `glib`, `anyhow`, `rand`). Tous transitifs, aucun avec une version
corrigée à ce jour. Rien à faire tant que `tauri` n'aura pas bougé.

**Le jeton de mise à jour, retiré et révoqué.** `VITE_UPDATER_TOKEN` était lu par
`import.meta.env`, et Vite remplace cette expression par la valeur littérale à la
compilation. Le jeton n'était donc pas lu au démarrage, il était gravé dans le
JavaScript, qui part dans le `.exe`. Il ne servait d'ailleurs à rien, l'adresse
de mise à jour étant un dépôt public où GitHub ne demande rien. Il a été retiré
du code et du workflow, et l'identifiant révoqué.

Cette révocation a une conséquence qu'il faut connaître.
`raw.githubusercontent.com` répond 404 à toute requête portant un en-tête
d'autorisation invalide, là où sans en-tête il répond 200. Or chaque version
depuis la v0.9.0 embarque le jeton désormais révoqué et l'envoie à chaque
démarrage, donc tout le parc installé reçoit 404 sur sa vérification et en
conclut silencieusement qu'il est à jour. Aucune publication ne les rattrapera,
le 404 venant de l'en-tête et non de ce qu'on met à l'autre bout. La seule sortie
est une réinstallation à la main, qui conserve bibliothèque et réglages. Le
README le dit en encadré et les notes de la 6.0.2 le disent dans l'application.

Reste ouvert : l'identifiant du bundle est toujours `com.anton.tauri-app`. Le
changer déplacerait le magasin de données, c'est donc un choix délibéré.

### Performances

L'application tourne à 60 images par seconde pour 16,7 ms par image. Ce n'est pas
un coût de calcul, c'est exactement 1/60 s, la synchronisation verticale. L'écran
de développement ne propose que du 60 Hz, c'est donc un plafond matériel et non
un symptôme. Le compteur mesure l'intervalle entre deux images et non le travail,
donc à 60 et 16,7 on ne sait pas s'il reste 3 ms de marge ou zéro.

Trouvé et supprimé : `antialias: true` sur le contexte WebGL ne lissait aucun
pixel. Toute la scène passe par le compositeur, dont les cibles de rendu n'ont
pas d'échantillons multiples, et le tampon de la canvas ne reçoit que le
quadrilatère plein écran de la dernière passe, qui n'a aucune arête intérieure.
On payait un tampon multi-échantillonné en 2560×1440 et sa résolution à chaque
image pour rien.

Le reste de la boucle est serré et a été vérifié plutôt que supposé : les
lectures de mise en page sont regroupées avant toute écriture de style, le
raycast de survol est conditionné au mouvement de la souris, les systèmes se
construisent à l'approche et se libèrent à l'éloignement, le débordement lumineux
est calculé à demi-résolution, et la scène s'arrête de dessiner quand un calque
la recouvre. Le découpage du bundle est déjà juste : 1 008 kB pour la page
d'accueil, three.js et la scène étant nécessaires au premier affichage, et tout
le reste en morceaux chargés à la demande, aucun au-dessus de 24 kB.

Reste à faire : afficher le temps de travail à côté de l'intervalle, seule mesure
qui dirait la marge réelle ; et vérifier sur quelle carte WebView2 rend
effectivement, la machine en ayant deux. L'application journalise celle qu'elle
obtient.

### Garder la CLI et le crate Tauri au même pas

Une construction locale a averti qu'elle ne pouvait pas inscrire le type
d'empaquetage dans le binaire, et que l'updater pourrait alors ne pas savoir
mettre à jour l'application. Le crate `tauri` était en 2.10.3 et
`@tauri-apps/cli` en 2.9.6, épinglée là par le verrou npm : la CI aurait
construit la release avec le même décalage et livré un binaire sur lequel
l'updater n'aurait pas pu agir.

Vérifié plutôt que supposé : le marqueur `__TAURI_BUNDLE_TYPE` était bien
présent dans le binaire construit. Le crate l'émettait, la CLI ne le
reconnaissait plus. La mise à jour de la CLI a suffi, et l'empaquetage annonce
désormais `Patching ...\cassini.exe with bundle type information: nsis`.

Cette ligne mérite d'être relue à chaque publication. C'est un avertissement et
non une erreur, donc la construction réussit dans les deux cas et rien d'autre
ne dit que l'updater est cassé.

La tâche de construction locale passe en outre
`--config '{"bundle":{"createUpdaterArtifacts":false}}'`. Sans lui, elle finit
sur une erreur de signature et un code de sortie 1, la clé privée n'existant que
comme secret GitHub, ce qui contredit une tâche dont le libellé annonce « non
signé ». La release garde la configuration du dépôt et signe pour de bon.

### Panneau de débogage, absent des versions publiées

Un panneau flottant, ouvert par `Ctrl+Alt+D` ou le bouton en bas à gauche : 61
réglages en seize groupes repliables, avec une recherche insensible aux accents.
Il couvre l'interface générale, la navigation, l'en-tête, la liste des jeux, la
barre des launchers, la fiche du jeu, les étiquettes 3D, la caméra, la lumière,
l'atmosphère, les planètes, les soleils, les systèmes, le chargement et le
mouvement, plus des outils de mise en page comme les contours des éléments, les
animations coupées et le compteur d'images.

Les réglages directs s'appliquent à chaud. Ceux qui fixent un nombre ou une
taille d'objets reconstruisent la scène une fois le curseur posé. Les valeurs
modifiées sont surlignées, comptées par groupe et retenues d'une session à
l'autre. « Copier les écarts » les classe par fichier où les reporter : les
réglages de scène dans `src/features/debug/tuning.ts`, ceux d'interface comme
valeur de repli de leur variable CSS.

Il est absent de la version publiée. Le panneau est monté derrière
`import.meta.env.DEV`, que Vite remplace par `false` à la compilation. Vérifié
sur le build de production : ni le composant ni ses libellés n'y figurent, alors
qu'un build de développement les émet. Le module des valeurs par défaut, lui, est
livré, la scène y lisant ce qu'elle lisait auparavant dans ses constantes.

### Scan en arrière-plan et état d'installation en direct

`scannerTousLesLaunchers()` tourne une fois par lancement, depuis `AppLayout`,
plutôt qu'à la mise au point de la fenêtre ou toutes les trente minutes comme
prévu au départ. Les neuf scans partent en parallèle, la fusion est séquentielle,
et le stockage n'est réécrit que si une empreinte insensible à l'ordre a changé.

`watcher.rs` surveille ce qui change la bibliothèque, fenêtre ouverte : les
manifestes de Steam (`steamapps/appmanifest_*.acf`, toutes bibliothèques) et
d'Epic (`Manifests/*.item`) avec la crate `notify`, et les clés Uninstall du
registre par `RegNotifyChangeKeyValue`, où s'inscrivent Battle.net, Riot,
Ubisoft, Rockstar et le lanceur d'Hytale. Seules l'apparition et la disparition
d'un manifeste comptent, Steam réécrivant le sien pendant tout un téléchargement.
Les rafales sont regroupées côté Rust avec 1,5 s de calme, puis l'événement
`bibliotheque-changee` fait relancer le scan habituel par `AppLayout`, au plus
une fois toutes les dix secondes, le dernier signal n'étant jamais perdu. S'y
ajoutent le scan au retour sur la fenêtre et le bouton Actualiser.

### Tests

Trois suites, 261 cas, toutes jouées par la CI à chaque poussée.

| Suite      | Cas | Ce qu'elle tient                                                                               |
| ---------- | --- | ---------------------------------------------------------------------------------------------- |
| Vitest     | 204 | Fusion des bibliothèques, stockage, traductions, géométrie des orbites, trajectoires de caméra |
| Cargo      | 50  | Scans de launchers, lecture du registre, choix du désinstalleur, extraction d'icônes           |
| Playwright | 7   | Parcours complets dans l'application qui tourne                                                |

Ce qui est couvert est ce dont une régression ne se voit pas : `deduplicateGames`
et `mergeById` (priorité entre plateformes, remontée du favori et de la dernière
partie depuis la copie écartée), `appliquerScan` (un scan ne perd jamais rien, et
un scanner ne touche qu'à sa propre plateforme, sans quoi scanner Steam
marquerait désinstallés tous les jeux Epic), `placePopup` (la carte ne sort
jamais du cadre, l'ergot reste dans la carte) et `composerFiche` (le couplage
entre largeur de fiche et décalage de la planète, que toute retouche isolée casse
sans bruit).

Vitest tourne en environnement Node, avec sa propre configuration. Celle de
l'application est asynchrone et porte le serveur de développement, et mêler les
deux rendait les tests tributaires de réglages qui changent pour d'autres
raisons.

Les parcours Playwright enregistrent une vidéo et des captures de chaque
exécution. Ils ne comparent aucun pixel : un rendu 3D change avec la carte
graphique et le pilote, donc un test qui échouerait pour cette raison ne dirait
rien d'utile. Les films servent à regarder, pas à juger.

Deux enseignements de l'écriture des tests unitaires. `normalizeName` **supprime**
le trait d'union au lieu de le remplacer par une espace, donc « Spider-Man »
devient `spiderman` et ne rejoint pas « Spider Man ». Le cas est rare, les deux
stores écrivant le plus souvent le titre de la même façon, et le comportement est
consigné par un test plutôt que corrigé en passant. Et la fiche tient centrée
jusqu'à près de 848 px de bande : en dessous seulement, la planète commence à
être poussée sur le côté.

Faire passer les parcours sur la CI a demandé quatre tentatives, et les trois
premières étaient de mauvais diagnostics qu'il vaut la peine de consigner :

1. Les captures d'écran ont été soupçonnées et coupées sur la CI. Aucun gain.
2. La compilation à la volée de Vite a été soupçonnée, donc la CI sert maintenant
   le build de production par `vite preview`. Aucun gain, mais c'est une
   meilleure chose à tester de toute façon, puisque c'est le bundle qui part
   réellement.
3. La qualité de rendu a été soupçonnée, donc les parcours sèment le préréglage
   Bas de l'application. Vrai gain en local sous rendu logiciel forcé, de 8 à 30
   images par seconde, mais pas assez.
4. La trace téléchargée depuis le coureur a donné la réponse : **un seul clic
   prenait 85 secondes**, et un `waitForTimeout(0)` en prenait 5. Playwright
   n'agit sur un élément qu'une fois celui-ci stable, c'est-à-dire immobile d'une
   image à l'autre, et sur un coureur sans carte graphique où les planètes
   tournent et la caméra voyage, cette condition met un temps déraisonnable à se
   présenter. Les parcours demandent maintenant le mouvement réduit, que
   l'application honore déjà en rendant le voyage de caméra instantané et en
   arrêtant les orbites. Chaque cas est passé sous 4,4 secondes.

Le travail a aussi été déplacé sur un coureur Linux. Les parcours n'éprouvent que
le front, donc rien n'imposait Windows, et le coureur Windows s'est montré lent et
irrégulier sur cette charge, de 9,8 secondes à 6,2 minutes pour des cas
comparables. Les deux travaux de tests unitaires restent sous Windows, leurs
suites raisonnant bel et bien sur des chemins et des clés de registre Windows.

Clippy tourne avec `-D warnings` sur une version **figée**, 1.92.0. Avec un
`stable` flottant, chaque sortie de Rust apporte de nouveaux lints et casse la CI
sur du code qui n'a pas changé, ce qui est exactement ce qui est arrivé au
premier passage : la machine était en 1.92, le coureur a pris la 1.99, et huit
lints inconnus ont fait tomber le travail.

Playwright ne télécharge pas ses navigateurs à l'installation des paquets, et les
versions récentes de npm bloquent de toute façon les scripts d'installation, donc
`pretest:e2e` joue `playwright install chromium` avant les tests. Sans cette
ligne, les sept parcours tombent tous sur « Executable doesn't exist », ce qui ne
ressemble en rien à un échec de test et ne laisse aucune vidéo, puisqu'il n'y a
rien à filmer quand le navigateur ne démarre pas.

Les composants React ne sont pas couverts. Il faudrait jsdom, qu'on ajoutera le
jour où un composant le justifiera plutôt que de charger un navigateur simulé
pour des fonctions qui calculent.

---

## Ce qui reste à faire

### Fonctionnalités

- **Statistiques de jeu.** Une page ou un panneau latéral. Données disponibles :
  `lastPlayedAt` par session, dont on ne stocke que la dernière aujourd'hui. De
  vraies statistiques demanderaient un tableau `playHistory: string[]` sur le
  type `Game`. Graphiques par semaine ou par mois, soit une bibliothèque légère,
  soit un dessin sur canvas. À montrer aussi : temps total estimé, jeu le plus
  joué, jours d'activité.
- **Tri avancé.** Ajouter `'size'` et `'playtime'` à `SortMode`, aujourd'hui
  `'recent' | 'az' | 'za'`. Le menu de tri est déjà en place, il suffit d'ajouter
  les options et le cas dans le comparateur.
- **Notifications système.** Par `tauri-plugin-notification`. Cas d'usage
  principal : repérer la fin d'un téléchargement Steam en guettant un nouveau
  manifeste `.acf` avec la crate `notify`, puis annoncer que le jeu est prêt.
  Demande la permission `notification` dans `tauri.conf.json`.
- **GOG Galaxy.** Une commande `scan_gog_games`. GOG range ses jeux dans le
  registre sous `HKLM\SOFTWARE\GOG.com\Games` et dans
  `C:\ProgramData\GOG.com\Galaxy\`. Chaque entrée porte `path`, `gameID` et
  `gameName`, et l'adresse de lancement serait `goggalaxy://openGame/{id}`.
  `'GOG'` existe déjà dans `GamePlatform` mais rien ne le remplit.
- **Vue liste.** Un paramètre d'adresse `viewMode: 'grid' | 'list'` sur la
  bibliothèque. En liste, chaque jeu est une ligne compacte : vignette, titre,
  plateforme, dernière session et bouton Jouer. La carte actuelle reste pour la
  grille.
- **Notes par jeu.** Un champ `notes: string` sur `Game`, une zone de texte dans
  un panneau latéral ou une modale, enregistrée automatiquement avec 500 ms de
  délai, et un point coloré sur les cartes qui en portent.
- **Arborescence dans le lecteur.** Une vue alternative avec de grandes tuiles de
  dossier montrant la première pochette trouvée, le nom du dossier et le nombre
  de pistes, qui se déplient sur les pistes en dessous. Utile quand on a beaucoup
  de dossiers.
- **Ajouter ses propres jeux et programmes.** Le code est écrit mais rien ne
  l'appelle, et c'est pourquoi le tableau dit à faire et non partiel : le tableau
  décrit ce qu'on peut faire, pas ce qui dort dans le dépôt.
  `createGameFromPath` fabrique un `Game` depuis un chemin d'exécutable ou de
  raccourci, avec le titre déduit du nom de fichier, un identifiant stable dérivé
  du chemin et la plateforme `'Other'`, et `addGameFromPicker` ouvre le sélecteur
  de fichier et l'ajoute. Il ne manque qu'un bouton, et de quoi choisir titre et
  icône. Le risque que je redoutais n'existe pas : `appliquerScan` ne touche
  qu'aux jeux de la plateforme scannée, et `'Other'` n'est le domaine d'aucun
  scanner, donc une entrée manuelle ne sera jamais marquée désinstallée.
- **Anneaux d'orbite plus discrets vus de près.** Les cercles bleus autour du
  soleil sont à 30 % d'opacité, montés de 16 % pour rester lisibles de loin, et
  ils saturent la vue de près. La piste : faire décroître l'opacité quand la
  caméra approche, comme le fait déjà la brume, une même grandeur gouvernant les
  deux, la distance au système.
- **Expiration du cache des jaquettes.** Le cache stocke `{ clé: url }` sans
  date. Le rendre `{ clé: { url, fetchedAt } }` et ignorer à la lecture les
  entrées de plus de trente jours, plus un bouton « vider le cache expiré » à
  côté du « tout vider » existant.
- **Taille de police de base plus grande** dans toute l'application.
- **Choisir sa propre musique d'ambiance** dans les paramètres.

### Une question ouverte

**Pourquoi ouvrir Cassini plutôt qu'un raccourci Windows.** Ce n'est pas une
fonctionnalité mais la question qui les commande toutes. Un raccourci sur le
bureau lance un jeu en un clic, sans rien ouvrir. Tant que Cassini ne fait que
lancer des jeux, il ajoute une étape. Ce qu'il apporte en propre, la vue
d'ensemble, la bibliothèque unifiée, ce qui se voit d'un coup d'œil et nulle part
ailleurs, mérite d'être identifié avant d'être développé.
