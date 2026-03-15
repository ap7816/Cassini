import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types';
import { sampleGames } from '../data/sampleGames';
import { loadGamesFromStorage, saveGamesToStorage } from '../services/libraryStorage';
import { exportLibraryToFile, importLibraryFromFile } from '../services/libraryFile';
import { pickGameFile } from '../services/pickGameFile';
import { createGameFromPath } from '../services/createGameFromPath';
import { isTauri } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const tauri = window.__TAURI__ as unknown as { invoke?: TauriInvoke } | undefined;
  if (tauri?.invoke) return tauri.invoke<T>(cmd, args);

  const mod = await import('@tauri-apps/api/core');
  const invoke = mod.invoke as unknown as TauriInvoke;
  return invoke<T>(cmd, args);
}

function mergeById(prev: Game[], incoming: Game[]): Game[] {
  const map = new Map<string, Game>();
  for (const g of prev) map.set(g.id, g);

  for (const g of incoming) {
    const existing = map.get(g.id);
    if (existing) {
      map.set(g.id, {
        ...existing,
        ...g,
        // user data: jamais perdu
        favorite: existing.favorite ?? g.favorite ?? false,
        lastPlayedAt: existing.lastPlayedAt ?? g.lastPlayedAt ?? null,
      });
    } else {
      map.set(g.id, { ...g, favorite: g.favorite ?? false });
    }
  }

  return Array.from(map.values());
}

function getSteamAppId(game: Game): string | null {
  // id: "steam-123456"
  if (game.id.startsWith('steam-')) return game.id.slice('steam-'.length);

  // fallback: launchUrl "steam://rungameid/123456"
  const m = game.launchUrl?.match(/rungameid\/(\d+)/);
  return m?.[1] ?? null;
}

function getEpicAppName(game: Game): string | null {
  // id: "epic-{AppName}"
  if (game.id.startsWith('epic-')) return game.id.slice('epic-'.length);

  // fallback: launchUrl "com.epicgames.launcher://apps/{AppName}?action=..."
  const m = game.launchUrl?.match(/apps\/([^?]+)/);
  return m?.[1] ?? null;
}

async function steamInstall(appId: string): Promise<void> {
  await openUrl(`steam://install/${appId}`);
}

async function steamUninstall(appId: string): Promise<void> {
  await openUrl(`steam://uninstall/${appId}`);
}

async function epicOpenInLauncher(appName: string): Promise<void> {
  // Epic ne supporte pas ?action=uninstall via URL.
  // On ouvre le launcher sur la page du jeu — l'utilisateur peut ensuite faire clic droit > Désinstaller.
  await openUrl(`com.epicgames.launcher://apps/${appName}?action=launch`);
}

export function useLibraryGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // ref toujours à jour pour lire la dernière liste dans des funcs async
  const gamesRef = useRef<Game[]>([]);
  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  // Load une fois
  useEffect(() => {
    setGames(loadGamesFromStorage());
  }, []);

  // Save (évite d’écraser au 1er render)
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      saveGamesToStorage(games);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [games]);

  const isEmpty = games.length === 0;

  const { installedCount, favoritesCount } = useMemo(() => {
    let installed = 0;
    let favorites = 0;

    for (const g of games) {
      if (g.installed) installed += 1;
      if (g.favorite) favorites += 1;
    }

    return { installedCount: installed, favoritesCount: favorites };
  }, [games]);

  function loadSamples() {
    setGames(sampleGames.map((g) => ({ ...g, favorite: g.favorite ?? false })));
  }

  function clearLibrary() {
    setGames([]);
  }

  function removeGame(id: string) {
    setGames((prev) => prev.filter((g) => g.id !== id));
  }

  function markPlayed(id: string) {
    const nowIso = new Date().toISOString();
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, lastPlayedAt: nowIso } : g)));
  }

  function toggleFavorite(id: string) {
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, favorite: !g.favorite } : g)));
  }

  async function exportToFile() {
    await exportLibraryToFile(games);
  }

  async function importFromFile() {
    const imported = await importLibraryFromFile();
    if (imported.length === 0) return;
    setGames((prev) => mergeById(prev, imported));
  }

  async function addGameFromPicker(): Promise<{ ok: true } | { ok: false; message: string }> {
    const picked = await pickGameFile();
    if (!picked.ok) {
      if (picked.reason === 'CANCELLED') return { ok: false, message: 'Cancelled.' };
      return { ok: false, message: picked.message };
    }

    const newGame: Game = { ...createGameFromPath(picked.path), favorite: false };

    setGames((prev) => {
      const exists = prev.some((g) => g.id === newGame.id);
      if (exists) return prev.map((g) => (g.id === newGame.id ? { ...g, ...newGame } : g));
      return [newGame, ...prev];
    });

    return { ok: true };
  }

  async function scanPcEpic(): Promise<
    { ok: true; added: number } | { ok: false; message: string }
  > {
    setIsScanning(true);
    setScanError(null);

    try {
      const detected = await tauriInvoke<Game[]>('scan_epic_games');

      const normalized: Game[] = detected.map((g) => ({
        ...g,
        platform: 'Epic' as const,
        installed: true,
        favorite: g.favorite ?? false,
      }));

      let added = 0;

      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;
        return mergeById(prev, normalized);
      });

      return { ok: true, added };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Epic scan failed.';
      setScanError(msg);
      return { ok: false, message: msg };
    } finally {
      setIsScanning(false);
    }
  }

  async function scanPcSteam(): Promise<
    { ok: true; added: number } | { ok: false; message: string }
  > {
    setIsScanning(true);
    setScanError(null);

    try {
      const detected = await tauriInvoke<Game[]>('scan_steam_games');

      const normalized: Game[] = detected.map((g) => ({
        ...g,
        platform: 'Steam',
        installed: true,
        favorite: g.favorite ?? false,
      }));

      let added = 0;

      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;
        return mergeById(prev, normalized);
      });

      return { ok: true, added };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Steam scan failed.';
      setScanError(msg);
      return { ok: false, message: msg };
    } finally {
      setIsScanning(false);
    }
  }

  // ⚠️ ICI: install/uninstall "réel" pour Steam via steam://
  async function toggleInstalledAsync(id: string): Promise<void> {
    const current = gamesRef.current.find((g) => g.id === id);
    if (!current) return;

    const nextInstalled = !current.installed;

    // Steam => déclenche vraiment l'action côté Steam
    if (current.platform === 'Steam') {
      if (!isTauri()) {
        window.alert('Steam install/uninstall is only available in the desktop app (Tauri).');
        return;
      }

      const appId = getSteamAppId(current);
      if (!appId) {
        window.alert('Cannot determine Steam app id for this game.');
        return;
      }

      try {
        if (nextInstalled) await steamInstall(appId);
        else await steamUninstall(appId);
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to open Steam action.';
        window.alert(msg);
        return;
      }

      // update UI (optimiste)
      setGames((prev) => prev.map((g) => (g.id === id ? { ...g, installed: nextInstalled } : g)));

      // petit rescan automatique pour recaler l’état réel (si l’uninstall prend du temps / cancel)
      window.setTimeout(() => void scanPcSteam(), 6000);
      return;
    }

    // Epic => déclenche l'action via le launcher Epic
    if (current.platform === 'Epic') {
      if (!isTauri()) {
        window.alert('Epic install/uninstall is only available in the desktop app (Tauri).');
        return;
      }

      const appName = getEpicAppName(current);
      if (!appName) {
        window.alert('Cannot determine Epic app name for this game.');
        return;
      }

      try {
        if (!nextInstalled) {
          await epicOpenInLauncher(appName);
          window.alert(
            'Le launcher Epic Games a été ouvert.\nFais un clic droit sur le jeu puis clique sur "Désinstaller".',
          );
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to open Epic launcher.';
        window.alert(msg);
        return;
      }

      // On ne change PAS l'état installed ici — l'utilisateur doit désinstaller manuellement
      // Un rescan recalera l'état réel après désinstallation
      window.setTimeout(() => void scanPcEpic(), 10000);
      return;
    }

    // Autres plateformes => comportement local (comme avant)
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, installed: nextInstalled } : g)));
  }

  function toggleInstalled(id: string) {
    void toggleInstalledAsync(id);
  }

  // Auto-scan 1 fois si la library est vide
  const didAutoScan = useRef(false);
  useEffect(() => {
    if (didAutoScan.current) return;
    if (games.length !== 0) return;

    didAutoScan.current = true;
    void Promise.all([scanPcSteam(), scanPcEpic()]);
  }, [games.length]);

  return {
    games,
    isEmpty,
    installedCount,
    favoritesCount,

    loadSamples,
    clearLibrary,
    removeGame,
    markPlayed,
    toggleInstalled,
    toggleFavorite,

    exportToFile,
    importFromFile,
    addGameFromPicker,

    scanPcSteam,
    scanPcEpic,
    isScanning,
    scanError,
  };
}
