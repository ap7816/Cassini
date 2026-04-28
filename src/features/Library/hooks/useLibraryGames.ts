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

const PLATFORM_PRIORITY: Record<string, number> = { Steam: 0, Epic: 1, BattleNet: 2 };

function normalizeName(title: string): string {
  return title.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

// Déduplique les jeux par nom normalisé, priorité Steam > Epic > BattleNet
// Fusionne les données utilisateur (favori, lastPlayedAt, image custom)
function deduplicateGames(games: Game[]): Game[] {
  const groups = new Map<string, Game[]>();
  for (const g of games) {
    const key = normalizeName(g.title);
    const group = groups.get(key) ?? [];
    group.push(g);
    groups.set(key, group);
  }

  const result: Game[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) { result.push(group[0]); continue; }

    group.sort((a, b) => (PLATFORM_PRIORITY[a.platform] ?? 99) - (PLATFORM_PRIORITY[b.platform] ?? 99));
    const winner = { ...group[0] };
    for (const g of group.slice(1)) {
      if (!winner.favorite && g.favorite) winner.favorite = true;
      if (!winner.lastPlayedAt && g.lastPlayedAt) winner.lastPlayedAt = g.lastPlayedAt;
      if (!winner.customImageUrl && g.customImageUrl) winner.customImageUrl = g.customImageUrl;
    }
    result.push(winner);
  }
  return result;
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
        // user data: jamais perdu lors d'un rescan
        favorite: existing.favorite ?? g.favorite ?? false,
        lastPlayedAt: existing.lastPlayedAt ?? g.lastPlayedAt ?? null,
        customImageUrl: existing.customImageUrl ?? g.customImageUrl ?? null,
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

  // ref toujours à jour pour lire la dernière liste dans des funcs async
  const gamesRef = useRef<Game[]>([]);
  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  // Load une fois
  useEffect(() => {
    setGames(deduplicateGames(loadGamesFromStorage()));
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

  function setGameImageUrl(id: string, url: string | null) {
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, customImageUrl: url } : g)));
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

  async function scanPcBattlenet(): Promise<
    { ok: true; added: number } | { ok: false; message: string }
  > {
    setIsScanning(true);
    setScanError(null);

    try {
      const detected = await tauriInvoke<Game[]>('scan_battlenet_games');

      const normalized: Game[] = detected.map((g) => ({
        ...g,
        platform: 'BattleNet' as const,
        installed: true,
        favorite: g.favorite ?? false,
      }));

      let added = 0;
      const incomingIds = new Set(normalized.map((g) => g.id));

      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;

        const updated = prev.map((g) =>
          g.platform === 'BattleNet' && !incomingIds.has(g.id) ? { ...g, installed: false } : g,
        );

        return deduplicateGames(mergeById(updated, normalized));
      });

      return { ok: true, added };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Battle.net scan failed.';
      setScanError(msg);
      return { ok: false, message: msg };
    } finally {
      setIsScanning(false);
    }
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
      const incomingIds = new Set(normalized.map((g) => g.id));

      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;

        // Les jeux Epic absents du rescan ne sont plus installés
        const updated = prev.map((g) =>
          g.platform === 'Epic' && !incomingIds.has(g.id) ? { ...g, installed: false } : g,
        );

        return deduplicateGames(mergeById(updated, normalized));
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
      const incomingIdsSteam = new Set(normalized.map((g) => g.id));

      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;

        // Les jeux Steam absents du rescan ne sont plus installés
        const updated = prev.map((g) =>
          g.platform === 'Steam' && !incomingIdsSteam.has(g.id) ? { ...g, installed: false } : g,
        );

        return deduplicateGames(mergeById(updated, normalized));
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
    void Promise.all([scanPcSteam(), scanPcEpic(), scanPcBattlenet()]);
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
    toggleFavorite,
    setGameImageUrl,

    exportToFile,
    importFromFile,
    addGameFromPicker,

    scanPcSteam,
    scanPcEpic,
    scanPcBattlenet,
    isScanning,
    scanError,
  };
}
