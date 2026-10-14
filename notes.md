# Notes du projet: Cassini

## C'est quoi Cassini ?

Cassini est une application de bureau Windows (Tauri + React) qui centralise tous tes jeux installés en une seule bibliothèque. Plutôt que d'ouvrir Steam, Epic, Battle.net, Ubisoft Connect, Riot, Rockstar, Hytale, HoYoPlay et l'application Xbox séparément pour trouver tes jeux, Cassini les scanne automatiquement et les affiche dans une interface unifiée — sous forme de liste, ou d'une galaxie où chaque launcher est un système solaire et chaque jeu une planète.

---

## Comment fonctionne l'appli

### Démarrage

À **chaque** lancement, l'app scanne les neuf launchers en parallèle (`scannerTousLesLaunchers`). Les scans partent ensemble, mais la fusion est séquentielle : chaque plateforme s'applique sur le résultat de la précédente, sinon la dernière écraserait les autres. Le stockage n'est réécrit que si le contenu a réellement changé — la comparaison passe par une empreinte insensible à l'ordre, sans quoi la galaxie se reconstruirait à chaque démarrage. Les changements se propagent en direct à la liste et à la scène 3D via `subscribeGames`. La bibliothèque elle-même vit dans le store Tauri (`archive.json`), avec `localStorage` en repli hors Tauri.

### Scan des launchers (côté Rust)

Chaque plateforme a une commande Tauri dédiée appelée depuis le frontend :

- `scan_steam_games` : lit le registre Windows et les manifestes `.acf` des bibliothèques Steam
- `scan_epic_games` : lit les manifestes `.item` dans le dossier ProgramData d'Epic
- `scan_battlenet_games` : lit la base de registre Windows pour les produits Blizzard
- `scan_riot_games` : détecte League of Legends, Valorant, etc.
- `scan_rockstar_games` : détecte GTA, RDR2, etc. via le Rockstar Games Launcher
- `scan_ubisoft_games` : détecte les jeux Ubisoft Connect

Après chaque rescan (bouton "Actualiser"), les jeux qui ne sont plus présents sont marqués "non installé" sans être supprimés.

### Déduplication

Un même jeu peut apparaître sur plusieurs plateformes (ex : Overwatch sur Steam et Battle.net). L'app déduplique automatiquement par nom normalisé et applique une priorité : **Steam > Epic > Battle.net**. Les données utilisateur (favori, dernière session, image perso) sont fusionnées sur le jeu conservé.

### Lancement d'un jeu

Chaque jeu a une `launchUrl` (ex: `steam://rungameid/12345` ou un chemin `.exe`). Quand tu cliques "Jouer", Tauri ouvre cette URL via le système. La date de dernière session est enregistrée automatiquement.

### Images (jeux)

La résolution d'image se fait en cascade pour chaque carte :

1. **Image personnalisée** (`customImageUrl`) : priorité absolue, n'est jamais remplacée
2. **Steam avec AppID** : l'URL CDN (`cdn.cloudflare.steamstatic.com/steam/apps/{id}/header.jpg`) est calculée directement depuis l'`id` du jeu (`steam-XXXXX`) — jamais mise en cache, toujours disponible même si le jeu est désinstallé. En cas d'échec, fallback sur `library_600x900.jpg`
3. **SteamGridDB** : pour tous les autres jeux. La clé API vit dans le gestionnaire d'identifiants Windows et ne transite jamais par le JavaScript — le frontend appelle `fetch_sgdb_image(title)`, Rust récupère la clé au dernier moment. Les résultats sont mis en cache dans le store. (Le service s'appelait `rawgService` du temps où il interrogeait RAWG.io ; il s'appelle aujourd'hui `coverArtService`.)

### Recherche et filtres

La barre de recherche globale (en haut de l'app) filtre en temps réel par titre. Dans la bibliothèque, deux onglets : **Jeux** (tous) et **Favoris**. La vue et la recherche sont synchronisées dans l'URL (query params).

### Launchers

Un onglet dédié liste les launchers installés (Steam, Epic, Battle.net, etc.) détectés par Tauri. On peut les ouvrir directement ou ouvrir leur dossier d'installation. Les icônes sont extraites du `.exe` et mises en cache.

### Lecteur de musique

Un lecteur MP3/FLAC/WAV/OGG/M4A/.opus intégré. On choisit un dossier, l'app scanne récursivement les sous-dossiers (côté Rust). La dernière piste jouée et le volume sont mémorisés en localStorage.

La musique ne vit plus dans une page : elle se pose **sur le système solaire**, en calque, par `Ctrl+M` ou le bouton de la barre des launchers. Quitter la vue pour changer d'album, c'était perdre ce qu'on regardait. Le calque est un lecteur et rien d'autre — pochette, titre, une course de lecture, cinq commandes, le volume, une recherche, et deux sections : ce qu'on vient d'écouter puis tout le reste, quatre-vingts lignes au plus (au-delà, on cherche, on ne fait pas défiler). Aucune métadonnée n'est lue pour la liste : titre et dossier suffisent à choisir, et les lire toutes ralentirait l'ouverture pour rien.

La page musique reste, pour ce qui demande de la place et se fait rarement : renommer, déplacer, changer une pochette, colorer un dossier. Un lien discret du lecteur y mène. Ses lignes partagent désormais une grille avec leur en-tête, l'album s'efface sous 780 px, et le numéro de piste devient le triangle de lecture au survol.

En bas à gauche de la vue, un bandeau réduit dit ce qui joue : pochette, titre, de quoi changer de piste, et un fil de progression sur le bord. Tout ce qu'il portait en plus — aléatoire, répétition, volume — est dans le lecteur, à un clic sur la pochette.

### Enrichissement musical (iTunes)

Au démarrage, l'app recherche automatiquement sur iTunes les métadonnées (artiste, album, pochette) de **toutes** les pistes. Les résultats sont gardés en mémoire uniquement (pas de persistance). L'algorithme construit un terme de recherche au format `"Artiste - Titre"` (en utilisant le tag ID3 artiste si disponible), puis un score de correspondance est calculé côté Rust (`word_recall`, seuil ≥ 0.7). Les pistes sans correspondance satisfaisante n'affichent rien plutôt qu'une mauvaise pochette. La pochette trouvée s'affiche sur la ligne de la piste, dans le lecteur et dans le bandeau du bas.

### Ce qui se pose sur la vue

La barre latérale de navigation n'existe plus : à terme il ne doit rester que le système solaire. Ce qu'elle portait s'est réparti sur les quatre coins de la vue — la marque en haut à gauche, le compteur d'images en haut à droite, les commandes de déplacement en bas à droite, ce qui joue en bas à gauche. Les deux premiers se calent contre la colonne de droite et suivent sa largeur, qui se règle.

Les réglages et la musique sont deux **calques** posés sur la scène (`Ctrl+,` et `Ctrl+M`, ou les deux boutons au pied de la barre des launchers ; le numéro de version est sous celui des réglages). Ils ne démontent jamais la scène : elle reste là, derrière. Les deux retiennent la tabulation, rendent le focus à son point de départ, et se ferment par Échap ou par un clic à côté.

Les autres pages — bibliothèque, launchers — sont masquées par défaut. Les réglages les rappellent une à une, et leur bouton apparaît alors au même endroit. Elles ne sont pas supprimées : seulement retirées du chemin le plus court.

### Système

- **Lancement au démarrage**: écrit une clé dans `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` via Rust/winreg pour démarrer Cassini avec Windows
- **Arrière-plan / tray**: quand activé, fermer la fenêtre cache l'app dans la barre des tâches système (tray). Un clic sur l'icône rouvre la fenêtre, le menu tray permet de quitter proprement

---

## Tableau des fonctionnalités

> 🟡 **Partiel** : une partie existe et fonctionne, une autre manque. Le détail
> de ce qui manque est dans « Détail des idées à venir ».

| Fonctionnalité                                                           | Statut     |
| ------------------------------------------------------------------------ | ---------- |
| Scan automatique (Steam, Epic, BattleNet, Ubisoft, Riot, Rockstar)       | ✅ Done    |
| Déduplication intelligente des jeux multi-plateformes                    | ✅ Done    |
| Lancement de jeux avec overlay d'animation                               | ✅ Done    |
| Historique de dernière session par jeu                                   | ✅ Done    |
| Système de favoris                                                       | ✅ Done    |
| Images: CDN Steam (direct, même désinstallé) + SteamGridDB + perso       | ✅ Done    |
| Cache des jaquettes dans le store                                        | ✅ Done    |
| Vider le cache des jaquettes                                             | ✅ Done    |
| Vider le cache WebView                                                   | ✅ Done    |
| Recherche temps réel par titre                                           | ✅ Done    |
| Onglet Favoris                                                           | ✅ Done    |
| Ajout manuel d'un jeu via sélecteur de fichier `.exe`                    | ✅ Done    |
| Export / import de la bibliothèque en JSON                               | ✅ Done    |
| Onglet Launchers avec ouverture directe et accès au dossier              | ✅ Done    |
| Mise à jour automatique (tauri-plugin-updater + GitHub Releases)         | ✅ Done    |
| Interface multilingue FR / EN                                            | ✅ Done    |
| Couleur d'accent personnalisable (palettes + color picker)               | ✅ Done    |
| Image de fond personnalisée avec opacité réglable                        | ✅ Done    |
| Réinitialisation complète de l'appli                                     | ✅ Done    |
| Architecture deux-repos (`.exe` privé + `latest.json` public)            | ✅ Done    |
| Lecteur de musique MP3 avec scan récursif des sous-dossiers              | ✅ Done    |
| Lecteur: dossiers repliables, recherche, bandeau « ce qui joue »         | ✅ Done    |
| Lecteur: mémorisation dernière piste + volume                            | ✅ Done    |
| Lancement automatique au démarrage de Windows                            | ✅ Done    |
| Rester en arrière-plan (icône tray)                                      | ✅ Done    |
| Lecteur: section « Récemment écoutés » (10 dernières pistes)             | ✅ Done    |
| Animations de transition entre pages                                     | ✅ Done    |
| Mini-lecteur animé (slide-up/down)                                       | ✅ Done    |
| Refonte visuelle globale (typo, scrollbars, animations)                  | ✅ Done    |
| Taille des jeux sur disque                                               | ✅ Done    |
| Vue Système Solaire                                                      | ✅ Done    |
| Statistiques de jeu (temps joué, graphiques)                             | ❌ À faire |
| Catégories / tags par genre ou état                                      | ✅ Done    |
| Tri des jeux (A-Z, Z-A, joué récemment)                                  | ✅ Done    |
| Filtres par plateforme et statut installé / non installé*                | ✅ Done    |
| Tri avancé (par taille disque, temps joué total)                         | ❌ À faire |
| Notifications (jeu prêt à jouer)                                         | ❌ À faire |
| Mode sombre / clair                                                      | ✅ Done    |
| Support _GOG_ Galaxy                                                     | ❌ À faire |
| Support Ubisoft Connect                                                  | ✅ Done    |
| Support Riot Games                                                       | ✅ Done    |
| Support Rockstar Games Launcher                                          | ✅ Done    |
| Support Xbox / Microsoft Store (Game Pass)                               | ✅ Done    |
| Raccourcis clavier                                                       | ✅ Done    |
| Vue liste (alternative à la grille)                                      | ❌ À faire |
| Notes par jeu                                                            | ❌ À faire |
| Scan en arrière-plan automatique                                         | ✅ Done    |
| Mise à jour du statut installé en temps réel                             | ✅ Done    |
| Cache des jaquettes avec TTL (SteamGridDB)                               | ❌ À faire |
| Lecteur: couleur personnalisée par dossier (clic droit)                  | ✅ Done    |
| Lecteur: déplacer une piste via clic droit → modale de sélection         | ✅ Done    |
| Lecteur: clic sur le bandeau du bas → ouvre le lecteur                   | ✅ Done    |
| Lecteur: affichage pochette d'album (ID3 tags embarqués)                 | ✅ Done    |
| Lecteur: enrichissement iTunes (pochette en ligne pour toutes)           | ✅ Done    |
| Lecteur: pochette enrichie visible dans le bandeau du bas                | ✅ Done    |
| Lecteur: mode aléatoire / répétition                                     | ✅ Done    |
| Lecteur: arborescence / grandes icônes de dossier                        | ❌ À faire |
| Tests unitaires (déduplication, tri, scans)                              | ✅ Done    |
| Rendre la taille des planètes flagrante pour un jeu très lourd           | ✅ Done    |
| Petit évenement aléatoire, étoile filante, vaisseau alien etc            | ✅ Done    |
| vaisseau promo steam, actualité etc                                      | ❌ À faire |
| Événements visibles partout, quelle que soit la distance de rendu        | ✅ Done    |
| Une musique par gros événement, au choix ou tirée d'un dossier          | ✅ Done    |
| Onglet « Graphisme » dans les paramètres : la scène réglable par tous     | ✅ Done    |
| Couper les événements du ciel sans couper le rideau de gaz              | ✅ Done    |
| Trou noir : un événement énorme, à regarder et rien d'autre              | ✅ Done    |
| Succès à décrocher : voir chaque événement, créer un système, etc.       | ❌ À faire |
| Choisir sa propre musique d'ambiance dans les paramètres                 | ❌ À faire |
| Personnalisation d'une planète (taille, couleur des anneaux)              | ✅ Done    |
| Anneaux d'orbite plus discrets vus de près                               | ❌ À faire |
| Systèmes solaires personnalisés (favoris, jeux choisis)                  | ✅ Done    |
| Déplacer les planètes en glissant (mode édition)                         | ✅ Done    |
| Barre des launchers : icônes agrandies, bouton de création               | ✅ Done    |
| Système solaire d'ouverture au choix                                     | ✅ Done    |
| Taille de police augmentée                                               | ❌ À faire |
| Musique en calque sur la scène + lecteur compact                         | ✅ Done    |
| Réglages en calque sur la scène, barre latérale supprimée                | ✅ Done    |
| Pages secondaires masquées, réactivables depuis les Réglages             | ✅ Done    |
| Largeur réglable de la liste et de la barre des launchers                | ✅ Done    |
| Quatre familles d'anneaux planétaires                                    | ✅ Done    |
| Menu de débogage, absent des versions publiées                           | ✅ Done    |
| Support HoYoverse (Genshin, Honkai, Zenless)                             | ✅ Done    |
| Ajouter ses propres jeux et programmes (Word, Godot, Unity…)             | ❌ À faire |
| Accessibilité : langue, contrastes, focus, mouvement réduit              | ✅ Done    |
| Accessibilité : réglages de confort dans les Paramètres                  | ❌ À faire |

---

## Détail des idées à venir

### Fonctionnalités

- **Personnalisation d'une planète**
  **Fait.** Chaque planète se règle — taille (×0,3 à ×3), distance au soleil, position sur l'orbite, et anneaux : ceux du tirage, aucun, ou une couleur au choix. Une planète qui n'en avait pas en reçoit un tiré de sa propre graine ; recolorer un anneau existant le rebâtit tirage pour tirage (les tirages sont gardés à la construction), il ne change que de teinte. Le choix est appliqué par `PlanetEntry.changerAnneau`, appelé depuis `appliquerPlacements`, qui ne reconstruit rien tant qu'il ne change pas.

  Les **systèmes des launchers** se personnalisent comme les autres : « Modifier » en tête de liste ouvre le même panneau, sans ce qui appartient à la bibliothèque — nom, icône, jeux. Leurs réglages sont rangés à part (`archive.solar.launcherSystems.v1`, relus par `normaliserReglagesLaunchers`) ; un réglage revenu aux valeurs par défaut n'est pas gardé.

  La **taille d'après le temps de jeu** est un réglage (Paramètres → Système solaire). Steam tient le temps de jeu en local, dans `userdata/<compte>/config/localconfig.vdf` : `steam_scan::temps_de_jeu` le lit sans clé d'API, et le scan l'ajoute aux jeux Steam (`playtimeMinutes`, affiché aussi sur la fiche). Un système sans temps de jeu connu — tous sauf Steam — garde l'espace disque, et un jeu jamais lancé retombe parmi les petits.

- **Anneaux d'orbite plus discrets vus de près**
  Les cercles bleus autour du soleil sont à 30 % d'opacité (`scene/planets.ts`), montés de 16 % pour rester lisibles de loin. De près, ils saturent la vue. Piste : faire décroître l'opacité quand la caméra approche, comme le fait déjà la brume avec `lib/haze.ts` — une même grandeur, la distance au système, gouvernerait les deux.

- **Systèmes solaires personnalisés**
  **Largement fait.** Le bouton **+** de la barre crée un système : nom, icône parmi douze, couleur, jeux choisis dans toute la bibliothèque. « Modifier », en tête de liste, ouvre un panneau de personnalisation posé sur la scène, qui agit en direct : taille du soleil, vitesse des planètes (jusqu'à les figer), orbites à plat, et pour chaque planète sa distance au soleil, sa position sur l'orbite et sa taille. On y ajoute et retire les jeux, on les trie d'un coup (A→Z, Z→A, taille, récence), et on y supprime le système. Les flèches qui montaient ou descendaient une planète d'une orbite ont disparu : on la fait glisser dans la scène, ce qui la place où l'on veut plutôt que d'un cran. Rien n'est enregistré avant « Enregistrer » ; « Annuler » rend le système tel qu'il était. Dans la liste d'un système, un **+** ou un **−** au survol ajoute ou retire un jeu sans ouvrir le panneau.

  Ces changements ne reconstruisent que le système concerné : la galaxie et la caméra restent en place. Seuls le nom et la couleur, qui touchent l'étiquette et les teintes, rebâtissent la scène. Un système désigne ses jeux sans les posséder : un jeu rangé dans « Favoris » reste dans son launcher, avec une planète dans chacun. Logique dans `lib/customSystems.ts`, application aux planètes dans `scene/placements.ts`, toutes deux vérifiées hors navigateur.

  S'y ajoutent la couleur propre de l'étoile, le tri automatique des planètes (A→Z, Z→A, taille, récence) et la **densité d'étoiles** autour du système, de 0 à ×3 : un nuage de points propre au système, en coquille juste au-delà de ses orbites, qui le distingue de ses voisins sur le ciel commun (`createNuageEtoiles`).

  L'**encombrement** d'un système agrandi est recalculé à l'enregistrement : `rayonSysteme` entre dans la clé de reconstruction de la galaxie, qui replace alors ses systèmes sans chevauchement. La couleur de l'étoile, elle, ne parvenait jamais à la scène hors de l'aperçu — la page ne lui transmettait qu'une partie du réglage ; elle reçoit désormais le réglage entier.

- **Déplacer les planètes en glissant (mode édition)**
  **Fait.** Pendant l'édition d'un système, une planète se saisit à la souris — le curseur devient une main — et suit le pointeur : le rayon est projeté sur le plan de sa propre orbite, inclinaison comprise (`positionSurOrbite`, inverse vérifié d'`orbitPos`), puis converti en distance et en angle. La caméra ne tourne pas pendant le geste : la saisie se fait en capture, avant les contrôles. L'éditeur reste maître du brouillon — la scène lui signale le glissement (`ecouterGlissement`), il en fait un placement borné comme ceux des curseurs, et ouvre les réglages de la planète pour qu'on les voie suivre.

- **Barre des launchers : icônes agrandies et création**
  **Fait.** Le bouton **+** de création est en place, sous les launchers, avec les icônes fournies par l'application et le choix de la couleur (voir « Systèmes solaires personnalisés »). La barre et la liste des jeux s'élargissent en tirant leur bord gauche, entre un minimum et un maximum — liste de 150 à 520 px, barre de 32 à 96 px —, au clavier aussi ; un double-clic rend la largeur par défaut, et le choix est retenu d'une session à l'autre. Le contenu suit la colonne : icônes et vignettes grandissent avec elle, le texte un peu moins vite et sans descendre sous un plancher de lisibilité. Chaque colonne a sa propre échelle. Logique dans `lib/largeurs.ts`, poignée dans `components/PoigneeLargeur.tsx`.

- **Système solaire d'ouverture au choix**
  **Fait.** Paramètres → Système solaire → « Système à l'ouverture » : automatique (le launcher le plus fourni, comme avant), dernier système visité, ou n'importe quel système — launcher ou système personnalisé. Le choix est résolu par `systemeOuverture` (`lib/ouverture.ts`) : un système qui n'existe plus — supprimé, ou launcher sans jeu — retombe sur l'automatique plutôt que d'ouvrir une vue vide. Le dernier système visité est retenu à chaque changement (`archive.solar.lastSystem.v1`).

- **Ajouter ses propres jeux et programmes**
  **Rien n'est accessible, mais le code est écrit.** Le tableau le porte en « à faire » et non en « partiel » : il décrit ce qu'on peut faire, pas ce qui dort dans le dépôt. `createGameFromPath` fabrique un `Game` depuis un chemin d'exécutable ou de raccourci — titre déduit du nom de fichier, identifiant stable dérivé du chemin, plateforme `'Other'` — et `addGameFromPicker` dans `useLibraryGames` ouvre le sélecteur de fichier et l'ajoute à la bibliothèque. **Aucun composant ne l'appelle** : il ne manque que le bouton, et de quoi choisir titre et icône. Le risque que je redoutais n'existe pas : `appliquerScan` ne touche qu'aux jeux de la plateforme scannée, et `'Other'` n'est le domaine d'aucun scanner — une entrée manuelle ne sera donc jamais marquée désinstallée.

- **Support HoYoverse (Genshin, Honkai, Zenless)**
  **Fait.** `hoyoplay_scan.rs` lit l'inventaire qu'HoYoPlay tient dans `HKCU\Software\Cognosphere\HYP\<version>\<code>` (et `miHoYo\HYP` pour la version chinoise) : un code par jeu (`hk4e_global`, `hkrpg_global`, `nap_global`, `bh3_global`) et son `GameInstallPath`. La branche `standalone`, qui décrit les copies d'autres boutiques comme Epic, est laissée à leur propre scanner. Le titre est celui qu'HoYoPlay inscrit dans la liste des programmes installés, reconnu à sa commande `--uninstall_game=<code>` ; à défaut, une table des jeux connus.

  La clé existe dès le début d'un téléchargement : le jeu n'est dit installé que si son exécutable est là, et c'est lui qu'on lance — Windows demande l'élévation si le jeu l'exige. Comme l'exécutable apparaît à la fin du téléchargement sans que le registre change, la veille surveille aussi les dossiers des jeux. La désinstallation passe par la commande officielle d'HoYoPlay. Le lanceur figure au `CATALOGUE`.

- **Taille de police**
  Augmenter la taille générale du texte de l'application.

- **Pourquoi ouvrir Cassini plutôt qu'un raccourci Windows**
  Ce n'est pas une fonctionnalité mais la question qui les commande toutes : un raccourci sur le bureau lance un jeu en un clic, sans rien ouvrir. Tant que Cassini ne fait que lancer, il ajoute une étape. Ce qu'il apporte en propre — la vue d'ensemble, la bibliothèque unifiée, ce qui se voit d'un coup d'œil et nulle part ailleurs — mérite d'être identifié avant d'être développé.

- **Taille des jeux sur disque**
  **Fait.** `sizeOnDisk` est porté par le type `Game`, renseigné par les scanners, affiché dans la liste du système solaire et sur la fiche du jeu, et il sert à dimensionner les planètes. **Reste à faire** : le tri par taille — `SortMode` de `LibraryPage` n'offre que `recent`, `az` et `za`.

- **Vue Système Solaire**
  **Fait**, et bien au-delà de ce que cette note prévoyait : ce n'est pas une vue alternative de la bibliothèque mais la page d'accueil de l'application, et pas du CSS/SVG mais une scène three.js. Les neuf launchers coexistent dans une seule galaxie ; chaque système est construit à l'approche et libéré à l'éloignement. La taille d'une planète vient de la taille sur disque, ou du temps de jeu si on le choisit — voir « Personnalisation d'une planète ».

  Une planète sur trois environ porte des anneaux, tirés parmi quatre familles calquées sur le système solaire : la nappe large et divisée de Saturne, les rubans étroits et très basculés d'Uranus, le voile de poussière de Jupiter, et les arcs de Neptune. Ce qui les distingue de loin, ce sont la largeur relative, l'opacité, l'inclinaison et le fait d'être complets ou non — la seule graine n'en changeait que le grain, et deux anneaux se ressemblaient dès qu'on les regardait de loin.

  Les arcs ont dû être repris : ils tiraient deux à quatre secteurs isolés, découpés net, sans rien pour dire qu'ils appartenaient au même cercle — on voyait des éclats flotter autour de la planète. Un voile continu les porte désormais, leurs extrémités s'éteignent en fondu (canal alpha des sommets, la bande de texture reste à une dimension), et le tirage est passé à trois à cinq. La texture d'anneau est aussi passée en mipmaps : ses 1024 texels tiennent parfois dans dix pixels — un anneau étroit vu de loin, ou n'importe lequel vu par la tranche — et sans niveaux réduits le rubanage se changeait en pointillés qui grouillaient dès que la planète tournait.

- **Les événements du ciel, visibles de partout**
  **Fait.** L'étoile filante, le passage, la supernova et la comète vivaient à leur place dans la galaxie. Elles y étaient condamnées deux fois : le plan lointain de la caméra les tranchait dès qu'on s'en éloignait de plus de vingt mille unités, et elles rapetissaient à mesure qu'on s'en allait — une supernova à l'autre bout de la galaxie n'existait plus pour personne.

  Chacune garde sa vraie trajectoire, dont on ne retient que la direction, et se dessine sur une sphère autour de l'œil, à `RAYON_CIEL` (2200) — le remède écrit pour la comète bleue, étendu aux quatre autres. Même coin de ciel, même taille apparente, et plus rien à couper. Ce qui a une étendue en suit la règle : la traînée est bâtie en angle plutôt qu'en distance, la queue de la comète est bornée en parts de ciel, et la direction qu'on leur donne est la part de leur course perpendiculaire au regard — ce qui vient droit sur nous ne traverse pas le ciel. La distance au soleil, elle, reste celle de la vraie place : c'est elle qui fait la longueur de la queue.

  Le rémanent de la supernova est reposé à chaque image, et pas seulement à l'allumage : il doit se retrouver dans le même coin de ciel jusqu'à la fin de la session. `scene/ciel.test.ts` vérifie les quatre, de près puis depuis trois fois le plan lointain — c'est lui qui a attrapé le passage dessiné à quatre millions d'unités, sorti d'un vecteur de travail qui servait aussi de sortie.

- **Le trou noir**
  **Fait, et en volume.** C'est un événement du ciel — le plus gros, le plus rare, une fois par session au plus et jamais avant vingt minutes. Il ne touche à rien.

  **Il arrive, il ne s'allume pas.** Neuf secondes pour paraître, une minute sur place, seize pour s'en aller — et le départ est le plus long des trois, parce qu'un départ aussi rapide que l'arrivée se lit comme un interrupteur. Il **grandit** du cinquième de sa taille au plein, puis rapetisse, la taille un peu en avance sur l'éclat : on voit d'abord quelque chose d'assez grand mais sombre, qui s'allume ensuite — l'ordre inverse ressemblerait à une explosion. Chaque pièce a son heure : l'ombre et son anneau de photons d'abord, qui sont l'objet, puis le disque, le temps que le gaz tombe et chauffe ; au départ, le même ordre à l'envers. Et la sortie traîne en racine plutôt que de tomber droit sur zéro, ce qui laisse à l'œil le temps de le perdre au lieu de le voir disparaître.

  Quatre pièces, et chacune a sa raison d'être là. **L'horizon** est une sphère : elle n'éclaire rien, tout son travail est d'écrire la profondeur, donc de cacher ce qui passe derrière. **Le disque** est un vrai anneau posé dans un plan, incliné au hasard à chaque fois, qui tourne plus vite au-dedans qu'au-dehors — c'est lui qui donne le relief, sa moitié lointaine disparaît derrière la sphère et ressort de l'autre côté. **L'anneau de photons** et **la couronne** restent tournés vers l'œil, et c'est exact : la lumière qui a fait le tour de l'objet ressort en cercle autour de l'ombre quel que soit l'endroit d'où on regarde ; la couronne ne se montre d'ailleurs que si le disque est vu de biais, puisqu'il faut du disque derrière l'ombre pour qu'il y ait quelque chose à relever.

  Il est **accroché au ciel**, haut au-dessus de la galaxie — une cinquantaine de degrés au-dessus de l'horizon, et une direction retenue une fois pour toutes. Les deux essais précédents disent pourquoi : posé à sa place dans la galaxie, il se faisait couper par le plan lointain dès qu'on s'en éloignait ; rapporté sur la sphère du ciel mais visé par un point fixe du monde, il traversait le ciel dès qu'on tournait autour d'un système, alors qu'il doit y être planté comme une étoile. Une direction, elle, ne bouge pour personne. Ce qu'on perd est de pouvoir s'en approcher — mais un objet qu'on peut atteindre n'est plus un événement du ciel.

  Son orientation est **choisie, et non tirée au hasard** : la normale du disque est le haut du monde ramené perpendiculaire à cette direction, puis penchée d'une quinzaine de degrés. Le plan du disque contient alors l'horizontale de l'écran — son ellipse y est couchée — et la pente ouvre juste assez pour qu'on en voie le dessus. Au hasard, il se dressait sur la tranche une fois sur deux ; à plat, vu de dessous, il n'était qu'une cible.

  Deux pièges d'éclat, payés comptant : les éclats avaient été réglés **sans la passe de débordement**, dont le seuil vaut 0,85 — à l'écran, l'objet était un aplat blanc. Les grandes surfaces restent désormais sous le seuil et gardent leur couleur, seul l'anneau de photons a le droit de le franchir. Et le mélange additif multiplie déjà la couleur par l'opacité : fournir les deux revenait à peindre au carré.

  **Ce qui a été essayé avant, et retiré** — à ne pas reprendre par le même chemin :

  - **Avaler les systèmes un par un**, chaque étoile et chaque planète happée à son tour en spirale. Trente secondes de cérémonie qui tenaient la scène en otage et remuaient tout ce qu'elle porte, pour une chose qu'on voulait voir ailleurs.
  - **Aspirer l'écran lui-même** par un filtre SVG posé sur la coque. L'idée tord bien l'application entière, boutons compris, pour une dizaine de millisecondes par image à condition que la région du filtre colle à la coque (140 % de marge : 36 ms ; 104 % : 13,3 ms, pour 12,1 ms au repos). Mais sa carte de déplacement tient sur huit bits, et c'est elle qui décide de tout : au-delà d'environ trois pixels de décalage entre deux niveaux voisins, l'image ne glisse plus, elle se gaufre. Tramer l'arrondi change les marches en grain et repousse la limite sans la lever.
  - D'où le partage **tourner d'un côté, rassembler de l'autre** : un pixel qui tourne reste à sa distance du trou, donc à l'écran, tandis qu'un pixel qui glisse va chercher sa couleur hors de la fenêtre et vide l'image par les bords avant que rien n'ait été mangé. Le vissage par le filtre, le resserrement par une transformation CSS dont l'origine est le point lui-même — le filtre ne sait pas rapprocher l'image entière d'un seul endroit, cela demanderait des décalages de plusieurs diagonales.
  - Et deux pièges de coordonnées : le point d'arrivée se lit **en coordonnées de mise en page**, la coque étant elle-même en train de se resserrer dessus ; et la projection rend le point symétrique quand l'objet passe derrière l'œil.

  Rien de tout cela n'est dans l'application : le trou noir n'avale plus rien, et c'est très bien ainsi.

- **La musique des événements, et l'interrupteur qui les coupe**
  **Fait.** L'interrupteur est dans l'onglet Graphisme, sous « Ciel vivant » — c'est un réglage de scène. Les musiques, elles, sont dans la carte Ambiance de l'onglet Personnalisation, avec la musique de fond et son volume : elles n'ont rien à faire parmi les réglages d'image.

  **Événements du ciel** est un interrupteur à part : il coupe les tirages — étoile filante, tempête, comète, passage, supernova, trou noir — sans toucher au rideau de gaz, qui reste gouverné par « Ciel vivant ». On peut vouloir un ciel qui respire sans que rien ne vienne traverser le regard pendant qu'on range sa bibliothèque. Le panneau de débogage, lui, continue de pouvoir les provoquer à la main.

  **La musique se règle événement par événement** — supernova, comète bleue, trou noir ont chacun la leur. Et ces trois-là seulement : les étoiles filantes reviennent toutes les trente secondes, et une musique à chaque fois ne serait plus une annonce mais du bruit. Elle entre et sort en fondu, s'arrête avec l'événement, et l'ambiance se tait pendant ce temps comme elle le fait déjà pour le lecteur.

  Les morceaux fournis vivent dans `features/evenements/pistes/`, **ramassé à la construction** par `import.meta.glob` : déposer un fichier suffit à l'ajouter, et un morceau y est tiré au sort à chaque événement. L'utilisateur peut aussi en choisir un sur sa machine — on n'en retient que le chemin, le fichier reste où il est, et il passe par le protocole d'actifs de Tauri, dont la portée couvre déjà `$HOME` et `$AUDIO`.

  Deux choses apprises en réparant ce qui ne marchait pas : un dialogue natif qui échoue doit le **dire** — avalé en silence, le bouton paraissait mort —, et une sonde `HEAD` sur un fichier statique ne prouve rien en développement, le serveur rendant la page d'accueil avec un franc 200 pour tout chemin inconnu. C'est le module qui sait maintenant s'il a de quoi jouer.

- **Statistiques de jeu**
  Nouvelle page ou panneau latéral. Données disponibles : `lastPlayedAt` par session (actuellement on n'enregistre que la dernière). Pour avoir de vraies stats, il faut stocker un tableau d'horodatages `playHistory: string[]` dans le type `Game`. Graphique par semaine/mois : bibliothèque légère type `recharts` ou dessin canvas custom. Afficher aussi : temps total estimé, jeu le plus joué, jours d'activité.

- **Catégories / tags**
  **Fait.** Chaque jeu porte des `tags` posés à la main, depuis la fiche du système solaire comme depuis sa carte dans la bibliothèque : six tags proposés (En cours, Terminé, À essayer, Abandonné, Multijoueur, Solo) et autant de tags libres qu'on veut, douze au plus par jeu, vingt-quatre caractères chacun. Les tags proposés sont rangés sous un identifiant et affichés traduits — changer la langue ne fige pas un « En cours » dans une interface anglaise ; les tags libres restent tels qu'on les a écrits. Les doublons ne tiennent pas compte de la casse.

  Ce sont des données de l'utilisateur : un scan ne les touche jamais, et deux copies d'un même jeu sur deux launchers réunissent leurs tags à la déduplication (`services/tags.ts`, vérifié hors navigateur).

  **Trois usages.** Un filtre par tag dans la barre de la bibliothèque, avec le nombre de jeux par tag et le choix gardé dans l'URL. Des puces de filtre sous la recherche du système solaire, qui ne proposent que les tags portés par les jeux du système affiché. Et surtout : un **système solaire alimenté par un tag** — il reprend tous les jeux qui le portent et se met à jour tout seul quand on en tague un, sans liste à tenir. Sa liste de planètes n'est alors ni modifiable ni triable, comme celle d'un launcher. La scène ne se reconstruit sur un changement de tag que si un système en dépend.

- **Tri avancé**
  Ajouter dans `SortMode` (actuellement `'recent' | 'az' | 'za'`) : `'size'` (taille disque, nécessite la fonctionnalité taille) et `'playtime'` (temps joué total, nécessite les stats). Le composant `<Select>` de tri dans `LibraryPage` est déjà en place, il suffit d'ajouter les nouvelles options et le cas dans le `.sort()`.

- **Notifications système**
  Via `tauri-plugin-notification`. Cas d'usage principal : détecter quand un téléchargement Steam est terminé (surveiller la création d'un nouveau fichier `.acf`). Côté Rust : watcher sur le dossier `steamapps/` avec `notify` crate. Quand un nouveau manifest apparaît → notif "Jeu prêt à jouer". Nécessite la permission `notification` dans `tauri.conf.json`.

- **Mode sombre / clair**
  **Fait.** Paramètres → Personnalisation → « Thème » : sombre, clair, ou système (suit Windows à chaud). Le thème se pose en `data-theme` sur `<html>`, avant la peinture ; `App.css` y redéfinit les jetons. Quatre jetons s'ajoutent à la famille `--hud` : `--encre` (textes et reflets), `--fond` (vitres et panneaux), `--ombre` (halo derrière un texte) et `--voile` (sur l'image de fond), plus `--vif`, la part d'une couleur vive dans un texte coloré. Les quelque 230 couleurs écrites en dur dans les feuilles de style ont été converties vers ces jetons par un script, puis relues à la main.

  L'espace reste noir dans les deux thèmes : c'est le ciel, pas l'interface. Ce qui s'y pose sans vitre — le logo, les étiquettes des planètes — porte la classe `theme-espace`, qui rétablit les couleurs du sombre, et les voiles sous les panneaux restent sombres. En clair, l'accent par défaut, un blanc cassé, prend le bleu de la structure, et un accent trop clair est assombri en gardant sa teinte jusqu'au seuil AA (`accentPourTheme`, `features/settings/theme.ts`). Contrastes mesurés écran par écran — système solaire, éditeur, fiche, paramètres, musique, bibliothèque : tout le texte actif passe 4,5 en clair.

- **Support GOG Galaxy**
  Côté Rust : nouvelle commande `scan_gog_games`. GOG stocke ses jeux dans le registre Windows (`HKLM\SOFTWARE\GOG.com\Games`) et dans `C:\ProgramData\GOG.com\Galaxy\`. Chaque entrée de registre contient `path`, `gameID`, `gameName`. La `launchUrl` serait `goggalaxy://openGame/{id}`. Ajouter `'GOG'` dans `GamePlatform` et dans le filtre plateforme.

- **Support Xbox / Microsoft Store (Game Pass)**
  **Fait**, et sans élévation — `WindowsApps` reste illisible, c'était la difficulté annoncée. `xbox_scan.rs` croise deux sources : les dossiers `XboxGames` de chaque disque, où chaque jeu porte un `MicrosoftGame.Config` (identité du paquet, titre affiché, logos) et un `appxmanifest.xml` (application à lancer) ; et l'inventaire des paquets du registre utilisateur, qui donne le nom complet du paquet. De ce nom se déduit la famille, d'où la cible `shell:AppsFolder\<famille>!<application>` — vérifiée auprès du shell, elle correspond exactement à ce que Windows attend.

  Cette forme de cible n'est ni une URL ni un chemin : elle est validée caractère par caractère, côté Rust avant lancement **et** à la relecture de la bibliothèque. Ce second contrôle manquait d'abord, et effaçait la cible à chaque démarrage : le bouton « Jouer » n'avait plus rien à lancer.

  Ces jeux n'existent dans aucun catalogue de jaquettes : Cassini affiche **le logo que le jeu porte lui-même**, lu dans son dossier (`cover_xbox`, limité aux dossiers `XboxGames`). Et comme aucun exécutable ne peut donner une icône de launcher, `store_icons.rs` demande au shell celle de l'application Xbox — la même que dans le menu Démarrer, prise sur la machine ; un dessin livré avec l'application sert de secours. La veille reconnaît l'arrivée d'un jeu, qui apparaît sous la forme d'un dossier.

  **Reste à faire** : la désinstallation, que Windows réserve à ses propres Paramètres.

- **Raccourcis clavier**
  **Fait.** Le déplacement dans la scène reste à la scène (WASD/ZQSD, touches et sensibilité configurables, `lib/flyKeys.ts`) : il se règle, et il ne vaut que lorsque la vue a le focus. Tout le reste passe par une écoute unique, dans `SolarSystemPage` — répartis entre plusieurs composants, les raccourcis finissaient par se marcher dessus, et personne ne pouvait dire lesquels existaient.

  `1` à `9` mènent au système correspondant de la barre, launchers puis systèmes personnalisés — et non plus « 1-5 pour la navigation », qui n'avait plus d'objet depuis que la barre latérale a disparu. `Ctrl+F` ramène la recherche sous la main, `F` bascule le favori du jeu choisi, `?` ouvre la liste des raccourcis, `Échap` ferme ce qui est ouvert. `Ctrl+,` et `Ctrl+M` restent portés par les calques, `Espace` par le lecteur.

  Deux précautions. Rien ne se déclenche pendant qu'on tape : un champ de saisie ou une zone éditable garde la main, sans quoi écrire « favori » dans la recherche basculerait huit fois le favori du jeu choisi — seul `Ctrl+F` traverse, pour revenir à la recherche depuis n'importe où. Et les chiffres sont lus par `e.code` et non `e.key` : sur un clavier AZERTY la rangée du haut produit des symboles.

  `AideRaccourcis` est la seule page où ils sont tous. Les touches de déplacement n'y sont pas recopiées — elles se règlent, et une seconde source de vérité finit toujours par mentir ; la liste renvoie au panneau « Commandes », qui les affiche.

- **Vue liste (jeux)**
  Ajouter `viewMode: 'grid' | 'list'` dans les params URL de `LibraryPage`. En mode liste : chaque jeu = une ligne compacte avec miniature, titre, plateforme, dernière session et bouton Jouer. Le composant `GameCard` actuel reste pour la grille ; créer un `GameRow` pour la liste. Toggle via icône dans la toolbar à côté du tri.

- **Notes par jeu**
  Ajouter `notes: string` dans le type `Game`. UI : zone de texte dans un panneau latéral ou modal ouvert depuis `GameCard` (bouton "📝"). Auto-save avec debounce 500 ms. Les notes sont stockées en `localStorage` comme les autres données utilisateur. Afficher un indicateur visuel (point coloré) sur les cartes qui ont des notes.

- **Lecteur : arborescence / grandes icônes de dossier**
  Vue alternative dans `MusicPage` (bouton toggle). Mode "grandes icônes" : afficher chaque dossier comme une tuile avec la pochette du premier album trouvé, le nom du dossier et le nombre de pistes. Clic → déplie les pistes en dessous (accordion). Utile quand on a beaucoup de dossiers et qu'on veut naviguer visuellement.

---

### Technique

- **Accessibilité — ce qui est fait**
  Audit mené sur l'ensemble de l'application, puis corrigé. La langue du document suit désormais celle de l'interface (la page se déclarait anglaise). Les notifications sont annoncées — région `aria-live` sur le conteneur, `role="alert"` pour les erreurs. Les fenêtres retiennent la tabulation et rendent le focus à son point de départ (`hooks/useFocus.ts`) ; Échap ferme partout ; le contour de focus, qu'annulaient trois feuilles, est rendu.

  Contrastes mesurés et corrigés : la liste passait sous 2,5 dès qu'une planète claire défilait derrière elle. Son fond est monté de 0,34 à 0,80 et les opacités faibles à 0,62–0,9 ; plus aucun texte sous 11 px. Le pire cas mesuré est passé de 1,35 à 5,40, seuil AA à 4,5.

  Le mouvement réduit est respecté : une règle globale dans `App.css` couvre les seize feuilles qui l'ignoraient, et la scène 3D — que le CSS ne peut pas atteindre — fige orbites, rotations et voyages de caméra quand le système le demande.

  Sémantique : la page d'accueil a un titre pour lecteur d'écran, la liste un `h2`, le champ de recherche une étiquette, et le launcher d'un jeu — jusque-là porté par la seule couleur d'une pastille — est annoncé. La scène et ses étiquettes sont écartées de l'arbre d'accessibilité : un canvas ne s'explore pas, et la liste en donne l'équivalent — mêmes jeux, vrais boutons, atteignables au clavier.

  Deuxième passe, après la refonte en calques. Les deux calques — réglages et musique — retiennent la tabulation et rendent le focus à son point de départ. Trois courses réglables étaient de simples `div` à l'écoute de la souris : la progression et le volume du lecteur, le fil du bandeau du bas. Invisibles pour un lecteur d'écran, hors d'atteinte au clavier. Elles passent par `components/Glissiere`, qui porte `role="slider"`, le nom, la valeur et sa lecture en clair (« 1:23 sur 4:10 » plutôt que « 33 »), les flèches, Origine et Fin, et un contour de focus — sans changer un pixel de ce qu'on voit. Le bouton de répétition, dont le contenu est un emoji, n'avait pas de nom accessible.

  **Reste à faire** : exposer dans les Paramètres la taille du texte et l'opacité de la liste (la plomberie existe, elle n'est aujourd'hui pilotée que par le panneau de débogage), prendre en compte `prefers-contrast`, et éprouver la mise en page à 200 % de zoom. Le panneau de débogage, lui, ne sert qu'à éprouver les réactions de l'application : il n'est pas une voie d'accès.

- **Sécurité — état de la revue**
  Revue menée sur toute la surface exposée. La politique de contenu est stricte : `default-src 'self'`, `script-src 'self'` sans `unsafe-inline` ni `eval`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action 'none'`, et une liste nommée d'hôtes d'images. Le protocole `asset:` est borné au profil utilisateur, avec un refus explicite de `.ssh`, `.aws`, `.gnupg` et des magasins d'identifiants de Windows. Les permissions Tauri n'ouvrent que sept schémas d'URL et treize exécutables de launcher, nommés un par un.

  Côté Rust, les trente-cinq commandes ont été reprises une à une : **toutes** celles qui reçoivent un chemin le valident avant de s'en servir — confinement sous la racine musique pour ce qui écrit, sous le profil utilisateur pour ce qui lit, résolution canonique des `..` et des liens. `launch_target` n'accepte qu'un des cinq schémas connus ou un chemin local existant sur une lettre de lecteur : ni UNC, ni `..`, ni caractère de contrôle. Rien ne passe plus par `cmd /c start`, qui reparsait `&` et `|` (voir `security.rs`, quatre tests).

  Côté JavaScript, aucun `dangerouslySetInnerHTML`, aucun `eval`, aucune construction de fonction ; le seul `innerHTML` est un vidage. La clé SteamGridDB reste dans le gestionnaire d'identifiants Windows et ne traverse jamais le JavaScript. Les mises à jour sont signées (minisign), l'index public.

  **Corrigé au passage** : `react-router-dom` traînait deux alertes de gravité haute (7.13.0 → 7.18.3, `npm audit` à zéro). Les cinq avis concernaient le rendu côté serveur, que cette application n'utilise pas — mais un correctif mineur ne se discute pas.

  **Dépendances Rust** : `cargo audit` passe les 690 entrées du verrou. Huit alertes au premier passage, sept levées par une mise à jour du seul fichier de verrouillage — aucun changement de code, cinq versions déplacées :

  - `rustls-webpki` 0.103.10 → 0.103.15. La plus sérieuse : c'est la bibliothèque qui valide les certificats du **mise à jour automatique**. Trois avis — contraintes de nom acceptées à tort pour des URI, contraintes acceptées pour un certificat à nom générique, et une panique atteignable en lisant une liste de révocation.
  - `h2` 0.4.14 → 0.4.19. Trames DATA vides sans borne, sur le chemin HTTP/2 de `reqwest` — celui qui interroge iTunes et SteamGridDB.
  - `quick-xml` 0.38.4 → 0.41.0, via `plist` 1.8.0 → 1.10.0. Deux alertes de gravité 7,5 : temps quadratique sur les attributs en double, et allocation sans borne des déclarations d'espace de noms. `plist` ne se compile que sur macOS, la version publiée est Windows : l'exposition réelle était nulle, mais la contrainte `^0.38` de `plist` interdisait de bouger — le passage à 1.10 la lève.
  - `crossbeam-epoch` 0.9.18 → 0.9.21. Déréférencement de pointeur invalide dans un affichage de mise au point, via `rayon` et le décodeur d'images `exr`.

  **La huitième reste**, et c'est un faux positif : `rkyv` 0.7.46 est une dépendance **optionnelle** de `rust_decimal`, lui-même tiré par `byte-unit` puis `tauri-plugin-log`. La fonctionnalité n'est pas activée — `cargo tree -i rkyv`, toutes cibles et tous types d'arêtes confondus, ne renvoie rien. Le code n'est donc jamais compilé. `cargo audit` lit le fichier de verrouillage, où figurent aussi les dépendances optionnelles.

  Restent seize avertissements « non maintenu » ou « non sûr » (`paste`, `fxhash`, les `unic-*`, `glib`, `anyhow`, `rand`) : tous transitifs, aucun avec une version corrigée à ce jour. Rien à faire tant que `tauri` n'aura pas bougé.

  **Reste à faire** : l'identifiant du bundle est resté `com.anton.tauri-app` — le changer déplacerait le magasin de données, c'est un choix délibéré (voir le renommage en Cassini).

- **Optimisation — ce qui a été mesuré**
  L'application tourne à 60 images par seconde pour 16,7 ms par image. Ce n'est pas un coût de calcul : c'est exactement 1/60 s, la synchronisation verticale. L'écran de développement ne propose que du 60 Hz (`2560×1440 @ 60`), c'est donc un plafond matériel, pas un symptôme. Le compteur, lui, mesure l'intervalle entre deux images et non le travail : à 60 · 16,7 on ne sait pas s'il reste 3 ms de marge ou zéro.

  **Trouvé et supprimé** : `antialias: true` sur le contexte WebGL ne lissait aucun pixel. Toute la scène passe par le compositeur, dont les cibles de rendu n'ont pas d'échantillons multiples ; le tampon de la canvas ne reçoit que le quadrilatère plein écran de la dernière passe, qui n'a aucune arête intérieure. On payait un tampon multi-échantillonné en 2560×1440 et sa résolution à chaque image pour rien.

  Le reste de la boucle est serré et a été vérifié plutôt que supposé : les lectures de mise en page sont regroupées avant toute écriture de style, le raycast de survol est conditionné au mouvement de la souris, les systèmes se construisent à l'approche et se libèrent à l'éloignement, le débordement lumineux est calculé à demi-résolution, et la scène s'arrête de dessiner quand un calque la recouvre. Le découpage du bundle est déjà juste : 1 008 kB pour la page d'accueil (three.js et la scène, nécessaires au premier affichage) et tout le reste en morceaux chargés à la demande, aucun au-dessus de 24 kB.

  **Reste à faire** : afficher le temps de travail à côté de l'intervalle, seule mesure qui dirait la marge réelle ; et vérifier sur quelle carte WebView2 rend effectivement, la machine en ayant deux (l'application journalise celle qu'elle obtient).

- **Menu de débogage, absent des versions publiées**
  **Fait.** Panneau flottant, ouvert par Ctrl+Alt+D ou par le bouton 🐞 en bas à gauche : 61 réglages en seize groupes repliables, avec une recherche insensible aux accents. Interface générale (police, taille du texte, arrondis, flou), navigation (largeur, logo, entrées), en-tête, liste des jeux (largeur, vignettes, espacement), barre des launchers (taille des icônes, largeur, opacités), fiche du jeu (opacité, bornes de largeur), étiquettes 3D, caméra (champ, zoom, amorti, approche, durée des voyages), lumière, atmosphère, planètes, soleils, systèmes, chargement, mouvement — et des outils de mise en page : contours des éléments, animations coupées, compteur d'images.

  Les réglages directs s'appliquent à chaud. Ceux qui fixent un nombre ou une taille d'objets — étoiles, astéroïdes, contraste des tailles — reconstruisent la scène, une fois le curseur posé. Les valeurs modifiées sont surlignées, comptées par groupe et retenues d'une session à l'autre. « Copier les écarts » les classe par fichier où les reporter : les réglages de scène dans `src/features/debug/tuning.ts`, ceux d'interface comme valeur de repli de leur variable CSS.

  **Absent de la version publiée** : le panneau est monté derrière `import.meta.env.DEV`, que Vite remplace par `false` à la compilation. Vérifié sur le build de production — ni le composant ni ses libellés n'y figurent, alors qu'un build de développement les émet. Le module des valeurs par défaut, lui, est livré : la scène y lit ce qu'elle lisait auparavant dans ses constantes.

- **Scan en arrière-plan automatique**
  **Fait**, autrement que prévu ici : plutôt qu'un rescan à la mise au point de la fenêtre ou toutes les trente minutes, `scannerTousLesLaunchers()` tourne une fois par lancement, dans `AppLayout`. Les neuf scans partent en parallèle, la fusion est séquentielle, et le stockage n'est réécrit que si une empreinte insensible à l'ordre a changé. La liste et la scène se mettent à jour d'elles-mêmes via `subscribeGames`. Le rescan périodique reste possible si le besoin s'en fait sentir.

- **Mise à jour du statut installé en temps réel**
  **Fait.** `watcher.rs` surveille ce qui change la bibliothèque, fenêtre ouverte : les manifestes de Steam (`steamapps/appmanifest_*.acf`, toutes bibliothèques) et d'Epic (`Manifests/*.item`) avec la crate `notify`, et les clés « Uninstall » du registre (`RegNotifyChangeKeyValue`), où s'inscrivent Battle.net, Riot, Ubisoft, Rockstar et le lanceur d'Hytale. Seules l'apparition et la disparition d'un manifeste comptent — Steam réécrit le sien pendant tout un téléchargement. Les rafales sont regroupées côté Rust (1,5 s de calme), puis l'événement `bibliotheque-changee` fait relancer le scan habituel par `AppLayout`, au plus une fois toutes les dix secondes, le dernier signal n'étant jamais perdu. S'y ajoutent le scan au retour sur la fenêtre et le bouton « Actualiser ».

- **Cache des jaquettes avec TTL**
  **RAWG n'est plus la source** : les jaquettes viennent du CDN Steam et de SteamGridDB (`coverArtService.ts`, qui garde son ancien nom de fichier par endroits). Le TTL, lui, n'existe toujours pas : le cache stocke `{ clé: url }` sans date. Le rendre `{ clé: { url, fetchedAt } }` et ignorer les entrées de plus de trente jours à la lecture ; ajouter un bouton « vider le cache expiré » à côté du bouton « tout vider ».

- **Tests unitaires**
  **Fait.** Neuf tests Rust sous `cargo test` (scans Hytale, catalogue des launchers, chemins) et trente-cinq tests JavaScript sous `npm test`, dans quatre fichiers posés à côté de ce qu'ils vérifient. Vitest en environnement Node, avec sa propre configuration : celle de l'application est asynchrone et porte le serveur de développement, mêler les deux rendait les tests tributaires de réglages qui changent pour d'autres raisons.

  Ce qui est couvert est ce dont une régression ne se voit pas : `deduplicateGames` et `mergeById` (priorité entre plateformes, remontée du favori et de la dernière partie depuis la copie écartée), `appliquerScan` (un scan ne perd jamais rien, et un scanner ne touche qu'à sa propre plateforme — sans quoi scanner Steam marquerait désinstallés tous les jeux Epic), `placePopup` (la carte ne sort jamais du cadre, l'ergot reste dans la carte) et `composerFiche` (le couplage entre largeur de fiche et décalage de la planète, que toute retouche isolée casse sans bruit).

  Deux enseignements de l'écriture. `normalizeName` **supprime** le trait d'union au lieu de le remplacer par une espace : « Spider-Man » devient `spiderman` et ne rejoint pas « Spider Man ». Le cas est rare — les deux stores écrivent le plus souvent le titre de la même façon — et le comportement est consigné par un test plutôt que corrigé en passant. Et la fiche tient centrée jusqu'à près de 848 px de bande : en dessous seulement, la planète commence à être poussée sur le côté.

  **Reste à faire** : les composants React ne sont pas couverts (il faudrait jsdom, qu'on ajoutera le jour où un composant le justifiera plutôt que de charger un navigateur simulé pour des fonctions qui calculent).
