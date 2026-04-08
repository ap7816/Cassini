# ArcHive

ArcHive is a Windows desktop app that centralizes all your games — across Steam, Epic Games, Battle.net, and more — into a single, fast, customizable library.

## Features

- **Unified library** — scan and display games from Steam, Epic Games, Battle.net and custom shortcuts in one place
- **Auto-detection** — detects installed games automatically from launcher registries and watched folders
- **Game artwork** — fetches cover images from the Steam CDN for Steam games, with RAWG API fallback for Epic/Battle.net and Steam games without a CDN image
- **Launchers tab** — quick access to open Steam, Epic, Battle.net, etc.
- **Favorites** — mark games as favorites and filter by them
- **UI customization** — custom background image, accent color, overlay opacity, language (FR/EN)
- **Auto-updater** — built-in update checker via GitHub Releases

## Tech Stack

- **Frontend**: React + TypeScript + Vite
- **Desktop**: Tauri v2 (Rust)
- **Target OS**: Windows 10/11
- **Image sources**: Steam CDN, RAWG API
- **Updates**: tauri-plugin-updater + GitHub Releases (two-repo architecture)

## Architecture

The project uses two GitHub repos:

- `apoumier/ArcHive` (private) — source code + release with `.exe` installer
- `apoumier/ArcHive-updates` (public) — `latest.json` update manifest consumed by the auto-updater

On each tagged release (`vX.Y.Z`), GitHub Actions builds the app, publishes the `.exe` to the private repo, and pushes the update manifest to the public repo.

## Requirements (Windows)

- Git
- Node.js (LTS) + npm
- Rust (rustup) + Cargo
- Visual Studio Build Tools 2022 with:
  - Desktop development with C++
  - MSVC v143
  - Windows 10/11 SDK
- Microsoft Edge WebView2 Runtime (usually pre-installed on Windows 10/11)

Verify in "Developer PowerShell for VS 2022":

    node -v
    npm -v
    rustc -V
    cargo -V
    where.exe link

`where.exe link` should return a path inside Visual Studio (MSVC toolchain).

## Getting Started

Run commands from "Developer PowerShell for VS 2022" to ensure the MSVC linker is available.

1. Clone

       git clone https://github.com/apoumier/ArcHive.git
       cd ArcHive

2. Install dependencies

       npm install

3. Run in dev mode

       npm run tauri dev

## Build

    npm run tauri build

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite frontend only (browser) |
| `npm run tauri dev` | Start the full desktop app in dev mode |
| `npm run tauri build` | Build the release installer |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm run typecheck` | TypeScript type check |

## Environment Variables

Create a `.env` file at the root for local dev:

    VITE_UPDATER_TOKEN=<github_pat_for_private_repo>

This token is used to authenticate update checks against the private release repo.

## Releasing

1. Bump version in `package.json` and `src-tauri/tauri.conf.json`
2. Commit and push to `main`
3. Tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
4. GitHub Actions builds and publishes automatically (~15-20 min)

## Troubleshooting

### `link.exe not found`

Install Visual Studio Build Tools 2022 with "Desktop development with C++" and use "Developer PowerShell for VS 2022".

### PowerShell blocks `npm.ps1`

Use `npm.cmd` instead, or:

    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

### WebView2 missing

Install the Microsoft Edge WebView2 Runtime (Evergreen standalone installer).

### Reset local data

Settings → Danger zone → **Tout effacer** wipes all local data and restarts the app.
To clear only the WebView image cache: Settings → Danger zone → **Vider le cache WebView**.
