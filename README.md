# Cassini

Application de bureau Windows (Tauri v2 + React) qui centralise tous tes jeux en une seule bibliothèque unifiée.

---

- **Bibliothèque unifiée :** scan automatique Steam, Epic Games, Battle.net, Ubisoft Connect, Riot Games, Rockstar ; les jeux s'affichent dans une grille unique avec filtres par plateforme et statut installé
- **Images :** CDN Steam calculé directement depuis l'AppID (toujours disponible même si le jeu est désinstallé) ; fallback RAWG API pour Epic/Battle.net ; image personnalisée par jeu possible
- **Lecteur de musique :** MP3, FLAC, WAV, OGG, M4A, opus ; scan récursif des sous-dossiers ; mini-player persistant en bas de l'écran sur toutes les pages ; recherche automatique de pochettes via iTunes ; mémorisation de la dernière piste et du volume
- **Onglet Launchers :** ouvrir Steam, Epic, etc. directement ou accéder à leur dossier d'installation
- **Favoris :** marquer des jeux et filtrer par favoris
- **Personnalisation :** image de fond, couleur d'accent, opacité de l'overlay, langue FR/EN
- **Mise à jour automatique :** via GitHub Releases + `tauri-plugin-updater`
- **Arrière-plan / tray :** fermer la fenêtre cache l'app dans le tray système ; clic sur l'icône pour rouvrir
- **Lancement au démarrage :** optionnel, via clé de registre Windows

---

- **Frontend :** React + TypeScript + Vite
- **Desktop :** Tauri v2 (Rust)
- **OS cible :** Windows 10 / 11
- **Sources d'images :** Steam CDN, iTunes Search API, RAWG API
- **Mises à jour :** `tauri-plugin-updater` + deux dépôts GitHub (privé pour le `.exe`, public pour le manifest)

---

- **Dépôt privé** `apoumier/Cassini` : code source + installeur `.exe`
- **Dépôt public** `apoumier/Cassini-updates` : `latest.json` consommé par l'auto-updater
- À chaque tag `vX.Y.Z`, GitHub Actions build l'app, publie le `.exe` sur le dépôt privé et pousse le manifest sur le dépôt public

---

Prérequis Windows :

- Git
- Node.js LTS + npm
- Rust (rustup) + Cargo
- Visual Studio Build Tools 2022 avec : Desktop development with C++ ; MSVC v143 ; Windows 10/11 SDK
- Microsoft Edge WebView2 Runtime (pré-installé sur Windows 10/11 en général)

Vérifier dans "Developer PowerShell for VS 2022" :

    node -v && npm -v && rustc -V && cargo -V && where.exe link

`where.exe link` doit retourner un chemin dans Visual Studio (toolchain MSVC).

---

Lancer depuis "Developer PowerShell for VS 2022" :

    git clone https://github.com/ap7816/Cassini.git
    cd Cassini
    npm install
    npm run tauri dev

Build release :

    npm run tauri build

---

| Commande | Description |
|---|---|
| `npm run dev` | Frontend Vite seul (navigateur) |
| `npm run tauri dev` | App desktop complète en mode dev |
| `npm run tauri build` | Build l'installeur de release |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
| `npm run typecheck` | Vérification TypeScript |

---

Fichier `.env` à la racine pour le dev local :

    VITE_UPDATER_TOKEN=<github_pat_for_private_repo>

Ce token authentifie les vérifications de mise à jour contre le dépôt privé.

---

Release :

1. Bumper la version dans `package.json` et `src-tauri/tauri.conf.json`
2. Commit + push sur `main`
3. `git tag vX.Y.Z && git push origin vX.Y.Z`
4. GitHub Actions build et publie automatiquement (~15-20 min)

---

Problèmes courants :

- `link.exe not found` : installer Visual Studio Build Tools 2022 avec "Desktop development with C++" et utiliser "Developer PowerShell for VS 2022"
- PowerShell bloque `npm.ps1` : utiliser `npm.cmd` ou exécuter `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`
- WebView2 manquant : installer le Microsoft Edge WebView2 Runtime (installeur standalone Evergreen)
- Réinitialiser les données : Paramètres → Zone de danger → **Tout effacer** ; pour vider uniquement le cache WebView : Paramètres → Zone de danger → **Vider le cache WebView**
