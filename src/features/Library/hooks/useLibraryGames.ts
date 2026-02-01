import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types';
import { sampleGames } from '../data/sampleGames';
import { loadGamesFromStorage, saveGamesToStorage } from '../services/libraryStorage';
import { exportLibraryToFile, importLibraryFromFile } from '../services/libraryFile';
import { pickGameFile } from '../services/pickGameFile';
import { createGameFromPath } from '../services/createGameFromPath';

type TauriInvoke = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // 1) global (si présent) — cast propre sans any
  const tauri = window.__TAURI__ as unknown as { invoke?: TauriInvoke } | undefined;
  if (tauri?.invoke) return tauri.invoke<T>(cmd, args);

  // 2) Tauri v2 (recommandé)
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

        // garde les champs "user" si le scan n'apporte rien
        lastPlayedAt: existing.lastPlayedAt ?? g.lastPlayedAt ?? null,
        favorite: existing.favorite ?? g.favorite ?? false,
      });
    } else {
      map.set(g.id, {
        ...g,
        favorite: g.favorite ?? false,
      });
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

  // Save (sans écraser le storage au tout premier render)
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    saveGamesToStorage(games);
  }, [games]);

  const isEmpty = games.length === 0;

  const installedCount = useMemo(() => games.filter((g) => g.installed).length, [games]);

  const favoritesCount = useMemo(() => games.filter((g) => Boolean(g.favorite)).length, [games]);

  function loadSamples() {
    // s'assure que favorite existe sur les samples
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
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, installed: !g.installed } : g)));
  }

  function toggleFavorite(id: string) {
    setGames((prev) =>
      prev.map((g) =>
        g.id === id ? { ...g, favorite: !Boolean(g.favorite) } : g
      )
    );
  }

  async function exportToFile() {
    await exportLibraryToFile(games);
  }

  async function importFromFile() {
    const imported = await importLibraryFromFile();
    if (imported.length === 0) return;

    // s'assure que favorite existe
    setGames(imported.map((g) => ({ ...g, favorite: g.favorite ?? false })));
  }

  async function addGameFromPicker(): Promise<{ ok: true } | { ok: false; message: string }> {
    const picked = await pickGameFile();
    if (!picked.ok) {
      if (picked.reason === 'CANCELLED') return { ok: false, message: 'Cancelled.' };
      return { ok: false, message: picked.message };
    }

    const newGame = createGameFromPath(picked.path);

    setGames((prev) => {
      const exists = prev.some((g) => g.id === newGame.id);
      if (exists) {
        return prev.map((g) =>
          g.id === newGame.id
            ? { ...g, ...newGame, favorite: g.favorite ?? false }
            : g
        );
      }
      return [{ ...newGame, favorite: false }, ...prev];
    });

    return { ok: true };
  }

  async function scanPcSteam(): Promise<{ ok: true; added: number } | { ok: false; message: string }> {
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

        const merged = mergeById(prev, normalized);
        // tu peux changer le tri après, mais on laisse ici simple
        merged.sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
        return merged;
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
