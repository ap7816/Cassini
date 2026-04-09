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

---

## Tableau des fonctionnalités

| Fonctionnalité | Statut |
|---|---|
| Scan automatique Steam / Epic Games / Battle.net | ✅ Done |
| Déduplication intelligente des jeux multi-plateformes | ✅ Done |
| Lancement de jeux avec overlay d'animation | ✅ Done |
| Historique de dernière session par jeu | ✅ Done |
| Système de favoris | ✅ Done |
| Images: CDN Steam + RAWG fallback + image personnalisée | ✅ Done |
| Cache RAWG en localStorage | ✅ Done |
| Vider le cache RAWG | ✅ Done |
| Vider le cache WebView | ✅ Done |
| Recherche temps réel par titre | ✅ Done |
| Onglet Favoris | ✅ Done |
| Ajout manuel d'un jeu via sélecteur de fichier `.exe` | ✅ Done |
| Export / import de la bibliothèque en JSON | ✅ Done |
| Onglet Launchers avec ouverture directe et accès au dossier | ✅ Done |
| Mise à jour automatique (tauri-plugin-updater + GitHub Releases) | ✅ Done |
| Interface multilingue FR / EN | ✅ Done |
| Couleur d'accent personnalisable (palettes + color picker) | ✅ Done |
| Image de fond personnalisée avec opacité réglable | ✅ Done |
| Réinitialisation complète de l'appli | ✅ Done |
| Architecture deux-repos (`.exe` privé + `latest.json` public) | ✅ Done |
| Page Mini-jeu avec intégration Unity WebGL | ✅ Done |
| Taille des jeux sur disque | ❌ À faire |
| Vue Système Solaire | ❌ À faire |
| Statistiques de jeu (temps joué, graphiques) | ❌ À faire |
| Catégories / tags par genre ou état | ❌ À faire |
| Tri avancé (taille, temps joué, date d'ajout) | ❌ À faire |
| Notifications (jeu prêt à jouer) | ❌ À faire |
| Mode sombre / clair | ❌ À faire |
| Support GOG Galaxy | ❌ À faire |
| Support Ubisoft Connect | ❌ À faire |
| Support Riot Games | ❌ À faire |
| Support Rockstar Games Launcher | ❌ À faire |
| Support Xbox / Microsoft Store (Game Pass) | ❌ À faire |
| Raccourcis clavier | ❌ À faire |
| Vue liste (alternative à la grille) | ❌ À faire |
| Notes par jeu | ❌ À faire |
| Lecteur MP3 intégré | ❌ À faire |
| Mini-jeu Unity (build WebGL à intégrer) | 🚧 En cours |
| Scan en arrière-plan automatique | ❌ À faire |
| Mise à jour du statut installé en temps réel | ❌ À faire |
| Cache RAWG avec TTL (expiration automatique) | ❌ À faire |
| Compression des images personnalisées de jeux | ❌ À faire |
| Tests unitaires (déduplication, tri, scans) | ❌ À faire |

---

## Détail des idées à venir

### Fonctionnalités

- **Taille des jeux**: afficher la taille sur disque sur chaque carte (ex: `42.3 GB`, `890 MB`). Côté Rust, calculer la taille du dossier d'installation via le chemin récupéré lors du scan. Afficher dans la carte sous le badge plateforme. Ajouter un tri "par taille" pour identifier les jeux qui prennent le plus de place
- **Vue Système Solaire**: vue alternative à la grille où chaque jeu est une planète en orbite autour d'un soleil central. La taille de la planète pourrait refléter le temps joué. Au survol (hover), le nom du jeu + l'image apparaissent en tooltip ou dans un panneau latéral. Cliquer sur une planète ouvre la fiche du jeu ou le lance directement. Animation CSS des orbites en continu, avec vitesse variable par planète
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
- **Mini-jeu intégré (Unity WebGL)**: intégrer un jeu Unity directement dans l'app. La page est prête, il reste à créer le jeu Unity et exporter le build WebGL dans `public/game/`
- **Lecteur MP3**: intégrer un lecteur de musique directement dans l'app. Sélectionner un dossier de fichiers `.mp3`, afficher la liste des pistes, lecture/pause/suivant/précédent, barre de progression, volume. La musique joue en fond pendant que tu navigues dans ta bibliothèque ou lances un jeu

### Technique

- **Scan en arrière-plan**: relancer le scan automatiquement à intervalle ou à la mise au point de la fenêtre
- **Mise à jour du statut installé en temps réel**: détecter quand un jeu est désinstallé sans avoir à rescanner manuellement
- **Cache RAWG avec TTL**: expiration automatique des images après X jours pour rester à jour
- **Compression des images personnalisées**: déjà fait pour le fond d'écran, à appliquer aussi aux images de jeux
- **Tests**: ajouter des tests unitaires sur la déduplication, le tri et le parsing des scans
