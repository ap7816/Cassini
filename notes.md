# Notes du projet: ArcHive

## C'est quoi ArcHive ?

ArcHive est une application de bureau Windows (Tauri + React) qui centralise tous tes jeux installés en une seule bibliothèque. Plutôt que d'ouvrir Steam, Epic et Battle.net séparément pour trouver tes jeux, ArcHive les scanne automatiquement et les affiche dans une interface unifiée.

---

## Comment fonctionne l'appli

### Démarrage

Au premier lancement (bibliothèque vide), l'app scanne automatiquement Steam, Epic Games, Battle.net, Ubisoft Connect, Riot Games et Rockstar en parallèle. Les jeux trouvés sont ajoutés et sauvegardés en `localStorage`. Au redémarrage, la bibliothèque est rechargée depuis le cache local.

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
3. **RAWG API fallback** : pour les jeux Epic/Battle.net. Nécessite une clé API. Les résultats sont mis en cache dans `localStorage`

### Recherche et filtres

La barre de recherche globale (en haut de l'app) filtre en temps réel par titre. Dans la bibliothèque, deux onglets : **Jeux** (tous) et **Favoris**. La vue et la recherche sont synchronisées dans l'URL (query params).

### Launchers

Un onglet dédié liste les launchers installés (Steam, Epic, Battle.net, etc.) détectés par Tauri. On peut les ouvrir directement ou ouvrir leur dossier d'installation. Les icônes sont extraites du `.exe` et mises en cache.

### Lecteur de musique

Un lecteur MP3/FLAC/WAV/OGG/M4A/.opus complet intégré dans l'app. On choisit un dossier, l'app scanne récursivement les sous-dossiers (côté Rust) et affiche la liste groupée par dossier. Les dossiers sont repliés par défaut. La barre de recherche filtre les pistes en temps réel. Un mini-player persistant reste visible en bas de l'écran sur toutes les pages, avec titre, contrôles, barre de progression et volume. La dernière piste jouée et le volume sont mémorisés en localStorage.

### Enrichissement musical (iTunes)

Au démarrage, l'app recherche automatiquement sur iTunes les métadonnées (artiste, album, pochette) de **toutes** les pistes. Les résultats sont gardés en mémoire uniquement (pas de persistance). L'algorithme construit un terme de recherche au format `"Artiste - Titre"` (en utilisant le tag ID3 artiste si disponible), puis un score de correspondance est calculé côté Rust (`word_recall`, seuil ≥ 0.7). Les pistes sans correspondance satisfaisante n'affichent rien plutôt qu'une mauvaise pochette. La pochette trouvée s'affiche sur la carte de la piste ET dans le mini-lecteur en bas de l'écran.

### Système

- **Lancement au démarrage**: écrit une clé dans `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` via Rust/winreg pour démarrer ArcHive avec Windows
- **Arrière-plan / tray**: quand activé, fermer la fenêtre cache l'app dans la barre des tâches système (tray). Un clic sur l'icône rouvre la fenêtre, le menu tray permet de quitter proprement

---

## Tableau des fonctionnalités

| Fonctionnalité                                                           | Statut     |
| ------------------------------------------------------------------------ | ---------- |
| Scan automatique (Steam, Epic, BattleNet, Ubisoft, Riot, Rockstar)       | ✅ Done    |
| Déduplication intelligente des jeux multi-plateformes                    | ✅ Done    |
| Lancement de jeux avec overlay d'animation                               | ✅ Done    |
| Historique de dernière session par jeu                                   | ✅ Done    |
| Système de favoris                                                       | ✅ Done    |
| Images: CDN Steam (direct, même désinstallé) + RAWG + perso              | ✅ Done    |
| Cache RAWG en localStorage                                               | ✅ Done    |
| Vider le cache RAWG                                                      | ✅ Done    |
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
| Lecteur: dossiers repliables, recherche, mini-player persistant          | ✅ Done    |
| Lecteur: mémorisation dernière piste + volume                            | ✅ Done    |
| Lancement automatique au démarrage de Windows                            | ✅ Done    |
| Rester en arrière-plan (icône tray)                                      | ✅ Done    |
| Lecteur: section « Récemment écoutés » (10 dernières pistes)             | ✅ Done    |
| Animations de transition entre pages                                     | ✅ Done    |
| Mini-lecteur animé (slide-up/down)                                       | ✅ Done    |
| Refonte visuelle globale (sidebar, typo, scrollbars, animations)         | ✅ Done    |
| Taille des jeux sur disque                                               | ❌ À faire |
| Vue Système Solaire                                                      | ❌ À faire |
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
| Raccourcis clavier                                                       | ❌ À faire |
| Vue liste (alternative à la grille)                                      | ❌ À faire |
| Notes par jeu                                                            | ❌ À faire |
| Scan en arrière-plan automatique                                         | ❌ À faire |
| Mise à jour du statut installé en temps réel                             | ❌ À faire |
| Cache RAWG avec TTL (expiration automatique)                             | ❌ À faire |
| Lecteur: couleur personnalisée par dossier (clic droit)                  | ✅ Done    |
| Lecteur: déplacer une piste via clic droit → modale de sélection         | ✅ Done    |
| Lecteur: clic sur le titre du mini-lecteur → navigue dans le bon dossier | ✅ Done    |
| Lecteur: affichage pochette d'album (ID3 tags embarqués)                 | ✅ Done    |
| Lecteur: enrichissement iTunes (pochette en ligne pour toutes)           | ✅ Done    |
| Lecteur: pochette enrichie visible dans le mini-lecteur                  | ✅ Done    |
| Lecteur: mode aléatoire / répétition                                     | ✅ Done    |
| Lecteur: arborescence / grandes icônes de dossier                        | ❌ À faire |
| Tests unitaires (déduplication, tri, scans)                              | ❌ À faire |
| Rendre les taille des planètes plus flagrante si un jeu est très lourd   | ❌ À faire |
| Petit évenement aléatoire, étoile filante, vaisseau alien etc            | ❌ À faire |
| vaisseau promo steam, actualité etc                                      | ❌ À faire |

---

## Détail des idées à venir

### Fonctionnalités

- **Taille des jeux sur disque**
  Afficher la taille sur chaque carte jeu (ex : `42.3 GB`, `890 MB`). Côté Rust : nouvelle commande `get_game_size` qui parcourt récursivement le dossier d'installation (chemin disponible dans le manifest ACF/Epic). Côté React : affichage sous le titre, tri "par taille" dans le sélecteur de tri existant (`SortMode`). Attention : calculer la taille d'un gros dossier peut prendre quelques secondes → lancer en tâche de fond et mettre en cache.

- **Vue Système Solaire**
  Vue alternative à la grille (bouton toggle dans `LibraryPage`). Chaque jeu = une planète en orbite autour d'un soleil central. Taille de la planète proportionnelle au temps joué. Animation CSS `@keyframes` pour les orbites. Clic sur une planète = ouvrir la fiche du jeu. Implémentation 100 % CSS/SVG, pas de lib externe.

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
  Gérer les événements `keydown` globaux dans `AppLayout`. Exemples : `Space` → play/pause musique, `F` → toggle favori sur le jeu survolé, `Ctrl+F` → focus barre de recherche, `Escape` → vider la recherche, `1-5` → navigation entre les onglets. Utiliser un hook `useHotkeys` custom ou la lib `react-hotkeys-hook`. Afficher les raccourcis dans une modale d'aide (`?`).

- **Vue liste (jeux)**
  Ajouter `viewMode: 'grid' | 'list'` dans les params URL de `LibraryPage`. En mode liste : chaque jeu = une ligne compacte avec miniature, titre, plateforme, dernière session et bouton Jouer. Le composant `GameCard` actuel reste pour la grille ; créer un `GameRow` pour la liste. Toggle via icône dans la toolbar à côté du tri.

- **Notes par jeu**
  Ajouter `notes: string` dans le type `Game`. UI : zone de texte dans un panneau latéral ou modal ouvert depuis `GameCard` (bouton "📝"). Auto-save avec debounce 500 ms. Les notes sont stockées en `localStorage` comme les autres données utilisateur. Afficher un indicateur visuel (point coloré) sur les cartes qui ont des notes.

- **Lecteur : arborescence / grandes icônes de dossier**
  Vue alternative dans `MusicPage` (bouton toggle). Mode "grandes icônes" : afficher chaque dossier comme une tuile avec la pochette du premier album trouvé, le nom du dossier et le nombre de pistes. Clic → déplie les pistes en dessous (accordion). Utile quand on a beaucoup de dossiers et qu'on veut naviguer visuellement.

---

### Technique

- **Scan en arrière-plan automatique**
  Actuellement le scan ne se déclenche que si `games.length === 0` (premier lancement) ou manuellement. À faire : déclencher un rescan silencieux à chaque mise au point de la fenêtre (`window.addEventListener('focus', ...)`) ou à intervalle (ex : toutes les 30 min via `setInterval`). Le rescan doit être non-bloquant : `setIsScanning(false)` même pendant le scan, juste mettre à jour les jeux en arrière-plan. Attention aux doublons si plusieurs focus rapprochés → utiliser un debounce.

- **Mise à jour du statut installé en temps réel**
  Côté Rust : utiliser la crate `notify` pour surveiller le dossier `steamapps/` (et équivalents Epic/Ubisoft). Quand un fichier `.acf` est supprimé → émettre un événement Tauri `game-uninstalled` avec l'appId. Côté React : écouter l'événement via `listen('game-uninstalled', ...)` et mettre à jour le statut `installed: false` sans rescan complet. Même logique pour la réinstallation quand le `.acf` réapparaît.

- **Cache RAWG avec TTL**
  Dans `rawgService.ts`, stocker non pas juste `{ key: url }` mais `{ key: { url, fetchedAt: number } }`. À la lecture (`loadCache`), ignorer les entrées dont `Date.now() - fetchedAt > TTL_MS` (ex : 30 jours). Ajouter un bouton "Vider le cache expiré" dans les paramètres (en plus du bouton "Vider tout" existant). Le TTL évite d'afficher indéfiniment une image supprimée du serveur RAWG.

- **Tests unitaires**
  Mettre en place Vitest (déjà compatible Vite). Priorités : `deduplicateGames()` dans `useLibraryGames.ts` (cas limites : même jeu sur 3 plateformes, fusion des favoris), `pickBestMatch()` dans `rawgService.ts` (éviter les régressions de matching), `match_score()` et `word_recall()` côté Rust avec `#[cfg(test)]`. Ajouter un script `npm run test` dans `package.json`.
