# Notes du projet: ArcHive

## C'est quoi ArcHive ?

ArcHive est une application de bureau Windows (Tauri + React) qui centralise tous tes jeux installés en une seule bibliothèque. Plutôt que d'ouvrir Steam, Epic et Battle.net séparément pour trouver tes jeux, ArcHive les scanne automatiquement et les affiche dans une interface unifiée.

---

## Comment fonctionne l'appli

### Démarrage

Au premier lancement (bibliothèque vide), l'app scanne automatiquement Steam, Epic Games et Battle.net en parallèle. Les jeux trouvés sont ajoutés et sauvegardés en `localStorage`. Au redémarrage, la bibliothèque est rechargée depuis le cache local.

### Scan des launchers (côté Rust)

Chaque plateforme a une commande Tauri dédiée appelée depuis le frontend :

- `scan_steam_games`: lit le registre Windows et les manifestes `.acf` des bibliothèques Steam
- `scan_epic_games`: lit les manifestes `.item` dans le dossier ProgramData d'Epic
- `scan_battlenet_games`: lit la base de registre Windows pour les produits Blizzard

Après chaque rescan (bouton "Actualiser"), les jeux qui ne sont plus présents sont marqués "non installé" sans être supprimés.

### Déduplication

Un même jeu peut apparaître sur plusieurs plateformes (ex : Overwatch sur Steam et Battle.net). L'app déduplique automatiquement par nom normalisé et applique une priorité : **Steam > Epic > Battle.net**. Les données utilisateur (favori, dernière session, image perso) sont fusionnées sur le jeu conservé.

### Lancement d'un jeu

Chaque jeu a une `launchUrl` (ex: `steam://rungameid/12345` ou un chemin `.exe`). Quand tu cliques "Jouer", Tauri ouvre cette URL via le système. La date de dernière session est enregistrée automatiquement.

### Images

La résolution d'image se fait en cascade pour chaque carte :

1. **Image personnalisée** (`customImageUrl`): priorité absolue, n'est jamais remplacée
2. **Steam avec AppID**: récupère `header.jpg` depuis le CDN Steam (`cdn.cloudflare.steamstatic.com`). Si l'image est introuvable (404), on tombe sur l'étape 3
3. **RAWG API fallback**: utilisé pour les jeux Epic/Battle.net, et pour les jeux Steam dont le CDN ne retourne rien. Nécessite une clé API configurée dans les paramètres. Les résultats sont mis en cache dans `localStorage` pour éviter des appels répétés

### Recherche et filtres

La barre de recherche globale (en haut de l'app) filtre en temps réel par titre. Dans la bibliothèque, deux onglets : **Jeux** (tous) et **Favoris**. La vue et la recherche sont synchronisées dans l'URL (query params).

### Launchers

Un onglet dédié liste les launchers installés (Steam, Epic, Battle.net, etc.) détectés par Tauri. On peut les ouvrir directement ou ouvrir leur dossier d'installation. Les icônes sont extraites du `.exe` et mises en cache.

### Lecteur de musique

Un lecteur MP3/FLAC/WAV/OGG/M4A complet intégré dans l'app. On choisit un dossier, l'app scanne récursivement les sous-dossiers (côté Rust) et affiche la liste groupée par dossier. Les dossiers sont repliés par défaut. La barre de recherche filtre les pistes en temps réel. Un mini-player persistant reste visible en bas de l'écran sur toutes les pages, avec titre, contrôles, barre de progression et volume. La dernière piste jouée et le volume sont mémorisés en localStorage.

### Système

- **Lancement au démarrage**: écrit une clé dans `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` via Rust/winreg pour démarrer ArcHive avec Windows
- **Arrière-plan / tray**: quand activé, fermer la fenêtre cache l'app dans la barre des tâches système (tray). Un clic sur l'icône rouvre la fenêtre, le menu tray permet de quitter proprement

---

## Tableau des fonctionnalités

| Fonctionnalité                                                   | Statut     |
| ---------------------------------------------------------------- | ---------- |
| Scan automatique Steam / Epic Games / Battle.net                 | ✅ Done    |
| Déduplication intelligente des jeux multi-plateformes            | ✅ Done    |
| Lancement de jeux avec overlay d'animation                       | ✅ Done    |
| Historique de dernière session par jeu                           | ✅ Done    |
| Système de favoris                                               | ✅ Done    |
| Images: CDN Steam + RAWG fallback + image personnalisée          | ✅ Done    |
| Cache RAWG en localStorage                                       | ✅ Done    |
| Vider le cache RAWG                                              | ✅ Done    |
| Vider le cache WebView                                           | ✅ Done    |
| Recherche temps réel par titre                                   | ✅ Done    |
| Onglet Favoris                                                   | ✅ Done    |
| Ajout manuel d'un jeu via sélecteur de fichier `.exe`            | ✅ Done    |
| Export / import de la bibliothèque en JSON                       | ✅ Done    |
| Onglet Launchers avec ouverture directe et accès au dossier      | ✅ Done    |
| Mise à jour automatique (tauri-plugin-updater + GitHub Releases) | ✅ Done    |
| Interface multilingue FR / EN                                    | ✅ Done    |
| Couleur d'accent personnalisable (palettes + color picker)       | ✅ Done    |
| Image de fond personnalisée avec opacité réglable                | ✅ Done    |
| Réinitialisation complète de l'appli                             | ✅ Done    |
| Architecture deux-repos (`.exe` privé + `latest.json` public)    | ✅ Done    |
| Page Mini-jeu avec intégration Unity WebGL (Netlify)             | ✅ Done    |
| Lecteur de musique MP3 avec scan récursif des sous-dossiers      | ✅ Done    |
| Lecteur: dossiers repliables, recherche, mini-player persistant  | ✅ Done    |
| Lecteur: mémorisation dernière piste + volume                    | ✅ Done    |
| Lancement automatique au démarrage de Windows                    | ✅ Done    |
| Rester en arrière-plan (icône tray)                              | ✅ Done    |
| Taille des jeux sur disque                                       | ❌ À faire |
| Vue Système Solaire                                              | ❌ À faire |
| Statistiques de jeu (temps joué, graphiques)                     | ❌ À faire |
| Catégories / tags par genre ou état                              | ❌ À faire |
| Tri avancé (taille, temps joué, date d'ajout)                    | ❌ À faire |
| Notifications (jeu prêt à jouer)                                 | ❌ À faire |
| Mode sombre / clair                                              | ❌ À faire |
| Support GOG Galaxy                                               | ❌ À faire |
| Support Ubisoft Connect                                          | ❌ À faire |
| Support Riot Games                                               | ❌ À faire |
| Support Rockstar Games Launcher                                  | ❌ À faire |
| Support Xbox / Microsoft Store (Game Pass)                       | ❌ À faire |
| Raccourcis clavier                                               | ❌ À faire |
| Vue liste (alternative à la grille)                              | ❌ À faire |
| Notes par jeu                                                    | ❌ À faire |
| Scan en arrière-plan automatique                                 | ❌ À faire |
| Mise à jour du statut installé en temps réel                     | ❌ À faire |
| Cache RAWG avec TTL (expiration automatique)                     | ❌ À faire |
| Lecteur: mode aléatoire / répétition                             | ❌ À faire |
| Lecteur: affichage pochette d'album (ID3 tags)                   | ❌ À faire |
| Tests unitaires (déduplication, tri, scans)                      | ❌ À faire |
| Musique : Zoom/Dezoom                                            | ❌ À faire |
| Musique : arborescence de fichiers / grandes icônes de dossier   | ❌ À faire |
| Musique : bouton random et boucle                                | ❌ À faire |

---

## Détail des idées à venir

### Fonctionnalités

- **Taille des jeux**: afficher la taille sur disque sur chaque carte (ex: `42.3 GB`, `890 MB`). Côté Rust, calculer la taille du dossier d'installation via le chemin récupéré lors du scan. Ajouter un tri "par taille" pour identifier les jeux qui prennent le plus de place
- **Vue Système Solaire**: vue alternative à la grille où chaque jeu est une planète en orbite autour d'un soleil central. La taille de la planète pourrait refléter le temps joué. Animation CSS des orbites en continu
- **Statistiques de jeu**: temps total joué par jeu, graphiques d'activité par semaine/mois
- **Catégories / tags**: pouvoir organiser les jeux par genre, état ("en cours", "terminé", "abandonné")
- **Tri avancé**: par temps joué, par date d'ajout, par plateforme
- **Notifications**: alerte quand un jeu téléchargé est prêt à jouer
- **Mode sombre / clair**: thème complet switchable (actuellement full dark)
- **Support GOG**: scanner les jeux GOG Galaxy
- **Support Ubisoft Connect**: déjà partiellement prévu dans les chemins du launcher
- **Support Riot Games**: League of Legends, Valorant, etc.
- **Support Rockstar Games Launcher**: GTA, RDR2
- **Support Xbox / Microsoft Store**: jeux via le Game Pass
- **Raccourcis clavier**: naviguer, lancer un jeu, basculer les favoris au clavier
- **Vue liste**: alternative à la grille de cartes (plus compact)
- **Notes par jeu**: ajouter un commentaire ou une note personnel sur un jeu
- **Lecteur: mode shuffle / repeat**: lire dans un ordre aléatoire ou en boucle
- **Lecteur: pochette d'album**: lire les tags ID3 des fichiers MP3 pour afficher l'artwork

### Technique

- **Scan en arrière-plan**: relancer le scan automatiquement à intervalle ou à la mise au point de la fenêtre
- **Mise à jour du statut installé en temps réel**: détecter quand un jeu est désinstallé sans avoir à rescanner manuellement
- **Cache RAWG avec TTL**: expiration automatique des images après X jours pour rester à jour
- **Tests**: ajouter des tests unitaires sur la déduplication, le tri et le parsing des scans
