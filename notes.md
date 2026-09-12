# Notes du projet: Cassini

## C'est quoi Cassini ?

Cassini est une application de bureau Windows (Tauri + React) qui centralise tous tes jeux installés en une seule bibliothèque. Plutôt que d'ouvrir Steam, Epic, Battle.net, Ubisoft Connect, Riot, Rockstar et Hytale séparément pour trouver tes jeux, Cassini les scanne automatiquement et les affiche dans une interface unifiée — sous forme de liste, ou d'une galaxie où chaque launcher est un système solaire et chaque jeu une planète.

---

## Comment fonctionne l'appli

### Démarrage

À **chaque** lancement, l'app scanne les sept launchers en parallèle (`scannerTousLesLaunchers`). Les scans partent ensemble, mais la fusion est séquentielle : chaque plateforme s'applique sur le résultat de la précédente, sinon la dernière écraserait les autres. Le stockage n'est réécrit que si le contenu a réellement changé — la comparaison passe par une empreinte insensible à l'ordre, sans quoi la galaxie se reconstruirait à chaque démarrage. Les changements se propagent en direct à la liste et à la scène 3D via `subscribeGames`. La bibliothèque elle-même vit dans le store Tauri (`archive.json`), avec `localStorage` en repli hors Tauri.

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
| Catégories / tags par genre ou état                                      | ❌ À faire |
| Tri des jeux (A-Z, Z-A, joué récemment)                                  | ✅ Done    |
| Filtres par plateforme et statut installé / non installé                 | ✅ Done    |
| Tri avancé (par taille disque, temps joué total)                         | ❌ À faire |
| Notifications (jeu prêt à jouer)                                         | ❌ À faire |
| Mode sombre / clair                                                      | ❌ À faire |
| Support GOG Galaxy                                                       | ❌ À faire |
| Support Ubisoft Connect                                                  | ✅ Done    |
| Support Riot Games                                                       | ✅ Done    |
| Support Rockstar Games Launcher                                          | ✅ Done    |
| Support Xbox / Microsoft Store (Game Pass)                               | ❌ À faire |
| Raccourcis clavier                                                       | ✅ Done    |
| Vue liste (alternative à la grille)                                      | ❌ À faire |
| Notes par jeu                                                            | ❌ À faire |
| Scan en arrière-plan automatique                                         | ✅ Done    |
| Mise à jour du statut installé en temps réel                             | 🟡 Partiel |
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
| Petit évenement aléatoire, étoile filante, vaisseau alien etc            | ❌ À faire |
| vaisseau promo steam, actualité etc                                      | ❌ À faire |
| Personnalisation d'une planète (taille, couleur des anneaux)              | 🟡 Partiel |
| Anneaux d'orbite plus discrets vus de près                               | ❌ À faire |
| Systèmes solaires personnalisés (favoris, jeux choisis)                  | 🟡 Partiel |
| Déplacer les planètes en glissant (mode édition)                         | 🟡 Partiel |
| Barre des launchers : icônes agrandies, bouton de création               | ✅ Done    |
| Système solaire d'ouverture au choix                                     | ❌ À faire |
| Taille de police augmentée                                               | ❌ À faire |
| Musique en calque sur la scène + lecteur compact                         | ✅ Done    |
| Réglages en calque sur la scène, barre latérale supprimée                | ✅ Done    |
| Pages secondaires masquées, réactivables depuis les Réglages             | ✅ Done    |
| Largeur réglable de la liste et de la barre des launchers                | ✅ Done    |
| Quatre familles d'anneaux planétaires                                    | ✅ Done    |
| Menu de débogage, absent des versions publiées                           | ✅ Done    |
| Support HoYoverse (Genshin, Honkai, Zenless)                             | ❌ À faire |
| Ajouter ses propres jeux et programmes (Word, Godot, Unity…)             | ❌ À faire |
| Accessibilité : langue, contrastes, focus, mouvement réduit              | ✅ Done    |
| Accessibilité : réglages de confort dans les Paramètres                  | ❌ À faire |

---

## Détail des idées à venir

### Fonctionnalités

- **Personnalisation d'une planète**
  **À moitié fait.** Dans un système personnalisé, la taille de chaque planète se règle (×0,3 à ×3 du rayon calculé d'après la taille sur disque), comme sa distance et sa position. **Reste à faire** : la couleur des anneaux, la personnalisation dans les systèmes des launchers, et la taille par défaut tirée du temps de jeu Steam.

- **Anneaux d'orbite plus discrets vus de près**
  Les cercles bleus autour du soleil sont à 30 % d'opacité (`scene/planets.ts`), montés de 16 % pour rester lisibles de loin. De près, ils saturent la vue. Piste : faire décroître l'opacité quand la caméra approche, comme le fait déjà la brume avec `lib/haze.ts` — une même grandeur, la distance au système, gouvernerait les deux.

- **Systèmes solaires personnalisés**
  **Largement fait.** Le bouton **+** de la barre crée un système : nom, icône parmi douze, couleur, jeux choisis dans toute la bibliothèque. « Modifier », en tête de liste, ouvre un panneau de personnalisation posé sur la scène, qui agit en direct : taille du soleil, vitesse des planètes (jusqu'à les figer), orbites à plat, et pour chaque planète sa distance au soleil, sa position sur l'orbite et sa taille. On y ajoute, retire et réordonne les jeux, et on y supprime le système. Rien n'est enregistré avant « Enregistrer » ; « Annuler » rend le système tel qu'il était. Dans la liste d'un système, un **+** ou un **−** au survol ajoute ou retire un jeu sans ouvrir le panneau.

  Ces changements ne reconstruisent que le système concerné : la galaxie et la caméra restent en place. Seuls le nom et la couleur, qui touchent l'étiquette et les teintes, rebâtissent la scène. Un système désigne ses jeux sans les posséder : un jeu rangé dans « Favoris » reste dans son launcher, avec une planète dans chacun. Logique dans `lib/customSystems.ts`, application aux planètes dans `scene/placements.ts`, toutes deux vérifiées hors navigateur.

  **Reste à faire** : couleur du soleil propre au système, nombre d'étoiles, tri automatique des planètes. Et l'encombrement d'un système agrandi n'est recalculé qu'au prochain démarrage : d'ici là, il peut empiéter sur un voisin.

- **Déplacer les planètes en glissant (mode édition)**
  **À moitié fait.** Chaque planète d'un système personnalisé se place déjà où l'on veut — distance au soleil et position sur l'orbite — avec des curseurs, en direct, orbites figées pendant le réglage. **Reste à faire** : la saisir et la faire glisser directement dans la scène.

- **Barre des launchers : icônes agrandies et création**
  **Fait.** Le bouton **+** de création est en place, sous les launchers, avec les icônes fournies par l'application et le choix de la couleur (voir « Systèmes solaires personnalisés »). La barre et la liste des jeux s'élargissent en tirant leur bord gauche, entre un minimum et un maximum — liste de 150 à 520 px, barre de 32 à 96 px —, au clavier aussi ; un double-clic rend la largeur par défaut, et le choix est retenu d'une session à l'autre. Le contenu suit la colonne : icônes et vignettes grandissent avec elle, le texte un peu moins vite et sans descendre sous un plancher de lisibilité. Chaque colonne a sa propre échelle. Logique dans `lib/largeurs.ts`, poignée dans `components/PoigneeLargeur.tsx`.

- **Système solaire d'ouverture au choix**
  La vue s'ouvre aujourd'hui sur un système décidé par le code. Le rendre configurable — y compris sur un système personnalisé, une fois ceux-ci possibles.

- **Ajouter ses propres jeux et programmes**
  **Rien n'est accessible, mais le code est écrit.** Le tableau le porte en « à faire » et non en « partiel » : il décrit ce qu'on peut faire, pas ce qui dort dans le dépôt. `createGameFromPath` fabrique un `Game` depuis un chemin d'exécutable ou de raccourci — titre déduit du nom de fichier, identifiant stable dérivé du chemin, plateforme `'Other'` — et `addGameFromPicker` dans `useLibraryGames` ouvre le sélecteur de fichier et l'ajoute à la bibliothèque. **Aucun composant ne l'appelle** : il ne manque que le bouton, et de quoi choisir titre et icône. Le risque que je redoutais n'existe pas : `appliquerScan` ne touche qu'aux jeux de la plateforme scannée, et `'Other'` n'est le domaine d'aucun scanner — une entrée manuelle ne sera donc jamais marquée désinstallée.

- **Support HoYoverse (Genshin, Honkai, Zenless)**
  Un scanner de plus dans `src-tauri/src/`, sur le modèle des six autres, ajouté au `CATALOGUE` de `launcher_scan.rs` et aux `SCANNERS` de `libraryScan.ts`. HoYoPlay écrit ses jeux dans la base de registre et tient un fichier de configuration par jeu.

- **Taille de police**
  Augmenter la taille générale du texte de l'application.

- **Pourquoi ouvrir Cassini plutôt qu'un raccourci Windows**
  Ce n'est pas une fonctionnalité mais la question qui les commande toutes : un raccourci sur le bureau lance un jeu en un clic, sans rien ouvrir. Tant que Cassini ne fait que lancer, il ajoute une étape. Ce qu'il apporte en propre — la vue d'ensemble, la bibliothèque unifiée, ce qui se voit d'un coup d'œil et nulle part ailleurs — mérite d'être identifié avant d'être développé.

- **Taille des jeux sur disque**
  **Fait.** `sizeOnDisk` est porté par le type `Game`, renseigné par les scanners, affiché dans la liste du système solaire et sur la fiche du jeu, et il sert à dimensionner les planètes. **Reste à faire** : le tri par taille — `SortMode` de `LibraryPage` n'offre que `recent`, `az` et `za`.

- **Vue Système Solaire**
  **Fait**, et bien au-delà de ce que cette note prévoyait : ce n'est pas une vue alternative de la bibliothèque mais la page d'accueil de l'application, et pas du CSS/SVG mais une scène three.js. Les sept launchers coexistent dans une seule galaxie ; chaque système est construit à l'approche et libéré à l'éloignement. La taille d'une planète vient de la taille sur disque, non du temps joué — ce dernier reste une piste, voir « Personnalisation d'une planète ».

  Une planète sur trois environ porte des anneaux, tirés parmi quatre familles calquées sur le système solaire : la nappe large et divisée de Saturne, les rubans étroits et très basculés d'Uranus, le voile de poussière de Jupiter, et les arcs de Neptune. Ce qui les distingue de loin, ce sont la largeur relative, l'opacité, l'inclinaison et le fait d'être complets ou non — la seule graine n'en changeait que le grain, et deux anneaux se ressemblaient dès qu'on les regardait de loin.

  Les arcs ont dû être repris : ils tiraient deux à quatre secteurs isolés, découpés net, sans rien pour dire qu'ils appartenaient au même cercle — on voyait des éclats flotter autour de la planète. Un voile continu les porte désormais, leurs extrémités s'éteignent en fondu (canal alpha des sommets, la bande de texture reste à une dimension), et le tirage est passé à trois à cinq. La texture d'anneau est aussi passée en mipmaps : ses 1024 texels tiennent parfois dans dix pixels — un anneau étroit vu de loin, ou n'importe lequel vu par la tranche — et sans niveaux réduits le rubanage se changeait en pointillés qui grouillaient dès que la planète tournait.

- **Statistiques de jeu**
  Nouvelle page ou panneau latéral. Données disponibles : `lastPlayedAt` par session (actuellement on n'enregistre que la dernière). Pour avoir de vraies stats, il faut stocker un tableau d'horodatages `playHistory: string[]` dans le type `Game`. Graphique par semaine/mois : bibliothèque légère type `recharts` ou dessin canvas custom. Afficher aussi : temps total estimé, jeu le plus joué, jours d'activité.

- **Catégories / tags**
  Ajouter un champ `tags: string[]` dans le type `Game`. UI : bouton "+ tag" sur chaque carte, sélection depuis une liste prédéfinie ("En cours", "Terminé", "Abandonné", "Multijoueur"…) + tags libres. Filtre par tag dans la barre de filtres existante (à côté du filtre plateforme). Stockage en `localStorage` comme les autres champs utilisateur.

- **Tri avancé**
  Ajouter dans `SortMode` (actuellement `'recent' | 'az' | 'za'`) : `'size'` (taille disque, nécessite la fonctionnalité taille) et `'playtime'` (temps joué total, nécessite les stats). Le composant `<Select>` de tri dans `LibraryPage` est déjà en place, il suffit d'ajouter les nouvelles options et le cas dans le `.sort()`.

- **Notifications système**
  Via `tauri-plugin-notification`. Cas d'usage principal : détecter quand un téléchargement Steam est terminé (surveiller la création d'un nouveau fichier `.acf`). Côté Rust : watcher sur le dossier `steamapps/` avec `notify` crate. Quand un nouveau manifest apparaît → notif "Jeu prêt à jouer". Nécessite la permission `notification` dans `tauri.conf.json`.

- **Mode sombre / clair**
  Ajouter un `themeMode: 'dark' | 'light' | 'system'` dans `AppSettings`. Basculer via une classe CSS sur `<body>` (ex : `data-theme="light"`). Les variables CSS actuelles (toutes dark-hardcodées dans `AppLayout.module.css`) devront être extraites en custom properties dans `:root[data-theme="light"]`. Beaucoup de variables à migrer — prévoir du temps.

- **Support GOG Galaxy**
  Côté Rust : nouvelle commande `scan_gog_games`. GOG stocke ses jeux dans le registre Windows (`HKLM\SOFTWARE\GOG.com\Games`) et dans `C:\ProgramData\GOG.com\Galaxy\`. Chaque entrée de registre contient `path`, `gameID`, `gameName`. La `launchUrl` serait `goggalaxy://openGame/{id}`. Ajouter `'GOG'` dans `GamePlatform` et dans le filtre plateforme.

- **Support Xbox / Microsoft Store (Game Pass)**
  Côté Rust : les jeux Xbox sont dans `C:\XboxGames\` ou dans les packages UWP (`Get-AppxPackage` PowerShell). La détection est complexe car Microsoft ne fournit pas de manifest standard. Piste : lire `C:\Program Files\WindowsApps\` (nécessite des droits admin) ou utiliser la base de registre `HKCU\Software\Classes\Local Settings\Software\Microsoft\Windows\CurrentVersion\AppModel\`. `launchUrl` : `ms-xbl-{titleId}://` ou `shell:AppsFolder\{packageFamilyName}!App`.

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
  **Fait**, autrement que prévu ici : plutôt qu'un rescan à la mise au point de la fenêtre ou toutes les trente minutes, `scannerTousLesLaunchers()` tourne une fois par lancement, dans `AppLayout`. Les sept scans partent en parallèle, la fusion est séquentielle, et le stockage n'est réécrit que si une empreinte insensible à l'ordre a changé. La liste et la scène se mettent à jour d'elles-mêmes via `subscribeGames`. Le rescan périodique reste possible si le besoin s'en fait sentir.

- **Mise à jour du statut installé en temps réel**
  **À moitié fait.** Un jeu désinstallé est bien repéré et marqué, mais au lancement suivant seulement : `appliquerScan` marque non installé tout jeu d'une plateforme que son scanner ne rapporte plus, sans jamais le supprimer. Ce qui manque est le temps réel — surveiller `steamapps/` et ses équivalents avec la crate `notify` côté Rust, émettre un événement Tauri, l'écouter côté React. La propagation vers l'interface, elle, existe déjà (`subscribeGames`).

- **Cache des jaquettes avec TTL**
  **RAWG n'est plus la source** : les jaquettes viennent du CDN Steam et de SteamGridDB (`coverArtService.ts`, qui garde son ancien nom de fichier par endroits). Le TTL, lui, n'existe toujours pas : le cache stocke `{ clé: url }` sans date. Le rendre `{ clé: { url, fetchedAt } }` et ignorer les entrées de plus de trente jours à la lecture ; ajouter un bouton « vider le cache expiré » à côté du bouton « tout vider ».

- **Tests unitaires**
  **Fait.** Neuf tests Rust sous `cargo test` (scans Hytale, catalogue des launchers, chemins) et trente-cinq tests JavaScript sous `npm test`, dans quatre fichiers posés à côté de ce qu'ils vérifient. Vitest en environnement Node, avec sa propre configuration : celle de l'application est asynchrone et porte le serveur de développement, mêler les deux rendait les tests tributaires de réglages qui changent pour d'autres raisons.

  Ce qui est couvert est ce dont une régression ne se voit pas : `deduplicateGames` et `mergeById` (priorité entre plateformes, remontée du favori et de la dernière partie depuis la copie écartée), `appliquerScan` (un scan ne perd jamais rien, et un scanner ne touche qu'à sa propre plateforme — sans quoi scanner Steam marquerait désinstallés tous les jeux Epic), `placePopup` (la carte ne sort jamais du cadre, l'ergot reste dans la carte) et `composerFiche` (le couplage entre largeur de fiche et décalage de la planète, que toute retouche isolée casse sans bruit).

  Deux enseignements de l'écriture. `normalizeName` **supprime** le trait d'union au lieu de le remplacer par une espace : « Spider-Man » devient `spiderman` et ne rejoint pas « Spider Man ». Le cas est rare — les deux stores écrivent le plus souvent le titre de la même façon — et le comportement est consigné par un test plutôt que corrigé en passant. Et la fiche tient centrée jusqu'à près de 848 px de bande : en dessous seulement, la planète commence à être poussée sur le côté.

  **Reste à faire** : les composants React ne sont pas couverts (il faudrait jsdom, qu'on ajoutera le jour où un composant le justifiera plutôt que de charger un navigateur simulé pour des fonctions qui calculent).
