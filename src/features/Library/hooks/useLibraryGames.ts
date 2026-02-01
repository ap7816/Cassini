import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types';
import { sampleGames } from '../data/sampleGames';
import { loadGamesFromStorage, saveGamesToStorage } from '../services/libraryStorage';
import { exportLibraryToFile, importLibraryFromFile } from '../services/libraryFile';
import { pickGameFile } from '../services/pickGameFile';
import { createGameFromPath } from '../services/createGameFromPath';

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
        // on ne perd jamais ces champs “user data”
        favorite: existing.favorite ?? g.favorite ?? false,
        lastPlayedAt: existing.lastPlayedAt ?? g.lastPlayedAt ?? null,
      });
    } else {
      map.set(g.id, { ...g, favorite: g.favorite ?? false });
    }
  }

  return Array.from(map.values());
}

export function useLibraryGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Load une fois
  useEffect(() => {
    setGames(loadGamesFromStorage());
  }, []);

  // Save (évite d’écraser le storage au tout premier render)
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const handle = window.setTimeout(() => {
      saveGamesToStorage(games);
    }, 250);
    return () => {
      window.clearTimeout(handle);
    };
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
    // on garde les defaults pour éviter des undefined
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

  function toggleInstalled(id: string) {
    setGames((prev) =>
      prev.map((g) => (g.id === id ? { ...g, installed: !Boolean(g.installed) } : g)),
    );
  }

  // ✅ IMPORTANT : pas de mutation, on retourne un nouvel objet
  function toggleFavorite(id: string) {
    setGames((prev) =>
      prev.map((g) => (g.id === id ? { ...g, favorite: !Boolean(g.favorite) } : g)),
    );
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

  // Auto-scan 1 fois si la library est vide
  const didAutoScan = useRef(false);
  useEffect(() => {
    if (didAutoScan.current) return;
    if (games.length !== 0) return;

    didAutoScan.current = true;
    void scanPcSteam();
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
    isScanning,
    scanError,
  };
}
