# ArcHive

ArcHive is a Windows desktop app that unifies all your installed games (launchers + shortcuts) into a single, fast library with automatic detection and UI customization.

## Overview

ArcHive aims to provide:

- A single game library (Steam/Epic/other launchers + Windows shortcuts)
- Automatic detection when new games are installed (scan + watchers)
- A "Launchers" tab to open Steam/Epic/etc quickly
- UI customization (background image/GIF/video, theme, layout)

Product notes and roadmap are stored in `docs/` (Obsidian-compatible).

## Requirements (Windows)

Required tools:

- Git
- Node.js (LTS) with npm
- Rust (rustup) + Cargo
- Visual Studio Build Tools 2022 with:
  - Desktop development with C++
  - MSVC v143
  - Windows 10/11 SDK

- Microsoft Edge WebView2 Runtime (often already installed)

Verify in "Developer PowerShell for VS 2022":

```powershell
node -v
npm -v
rustc -V
cargo -V
where.exe link
```

`where.exe link` should return a path inside Visual Studio (MSVC toolchain).

## Getting Started (Local Dev)

Recommended: run commands from "Developer PowerShell for VS 2022" to ensure the MSVC linker (`link.exe`) is available.

1. Clone

```powershell
git clone https://github.com/<your_user>/ArcHive.git
cd ArcHive
```

2. Install dependencies
   If PowerShell blocks `npm.ps1`, use `npm.cmd` instead of `npm`.

```powershell
npm install
```

3. Run in development mode

```powershell
npm run tauri dev
```

This starts Vite (frontend) and launches the Tauri desktop window.

## Build (Release)

```powershell
npm run tauri build
```

## Useful Scripts

- `npm run dev`: start only the Vite frontend
- `npm run tauri dev`: start the full desktop app in dev mode
- `npm run tauri build`: build the desktop app (release)

## Troubleshooting

### Error: `link.exe not found`

Cause: MSVC C++ build tools are missing or not loaded in the current terminal.

Fix:

- Install Visual Studio Build Tools 2022 with "Desktop development with C++" (MSVC v143 + Windows SDK)
- Use "Developer PowerShell for VS 2022"
- Verify:

```powershell
where.exe link
```

### PowerShell blocks `npm.ps1` (ExecutionPolicy)

Use:

```powershell
npm.cmd install
npm.cmd run tauri dev
```

Optional (CurrentUser only):

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## Documentation

Documentation lives in `docs/`.
Entry point:

- `docs/Home.md`
