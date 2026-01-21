# ArcHive

ArcHive is a Windows desktop app that unifies all your installed games (launchers + shortcuts) into a single, fast library with UI customization.

## Overview

ArcHive aims to provide:

- A single game library (Steam/Epic/other launchers + Windows shortcuts)
- Automatic detection when new games are installed (scan + watchers)
- A "Launchers" tab to open Steam/Epic/etc quickly
- UI customization (background image, theme, layout)

Product notes and roadmap are stored in `docs/` (Obsidian-compatible).

## Tech Stack

- Frontend: React + TypeScript + Vite
- Desktop: Tauri (Rust)
- Target OS: Windows 10/11

## Requirements (Windows)

Required tools:

- Git
- Node.js (LTS) with npm
- Rust (rustup) + Cargo
- Visual Studio Build Tools 2022 with:
  - Desktop development with C++
  - MSVC v143
  - Windows 10/11 SDK
- Microsoft Edge WebView2 Runtime (often already installed on Windows 10/11)

Verify in "Developer PowerShell for VS 2022":

    node -v
    npm -v
    rustc -V
    cargo -V
    where.exe link

`where.exe link` should return a path inside Visual Studio (MSVC toolchain).

## Getting Started (Local Dev)

Recommended: run commands from "Developer PowerShell for VS 2022" to ensure the MSVC linker (`link.exe`) is available.

1) Clone

    git clone https://github.com/<your_user>/ArcHive.git
    cd ArcHive

2) Install dependencies

If PowerShell blocks `npm.ps1`, use `npm.cmd` instead of `npm` (see Troubleshooting).

    npm install

3) Run the desktop app (dev)

    npm run tauri dev

This starts Vite (frontend) and launches the Tauri desktop window.

## Build (Release)

    npm run tauri build

## Useful Scripts

- `npm run dev`: start only the Vite frontend (browser)
- `npm run tauri dev`: start the full desktop app in dev mode
- `npm run tauri build`: build the desktop app (release)
- `npm run lint`: run ESLint
- `npm run format`: run Prettier (write)

## Troubleshooting

### Error: `link.exe not found`

Cause: MSVC C++ build tools are missing or not loaded in the current terminal.

Fix:

- Install Visual Studio Build Tools 2022 with "Desktop development with C++" (MSVC v143 + Windows SDK)
- Use "Developer PowerShell for VS 2022"
- Verify:

    where.exe link

### PowerShell blocks `npm.ps1` (ExecutionPolicy)

Use:

    npm.cmd install
    npm.cmd run tauri dev

Optional (CurrentUser only):

    Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned

### WebView2 is missing

Symptom: the app window cannot start or crashes early.

Fix: install the Microsoft Edge WebView2 Runtime (Evergreen).

### Desktop icon does not update

Windows may cache icons.

Fix ideas:

- Regenerate icons: `npm run tauri icon <path-to-1024x1024-png>`
- Clean and rebuild:
  - `cd src-tauri; cargo clean; cd ..`
  - `npm run tauri dev`
- If the app is pinned to the taskbar, unpin and pin again.

### Reset local data

ArcHive currently stores local settings and library data in local storage.

If you need a clean state:

- Clear the library (UI) and restart the app
- Or clear site/app storage via DevTools (Application > Storage)