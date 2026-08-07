import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types';
import { sampleGames } from '../data/sampleGames';
import { loadGamesFromStorage, saveGamesToStorage } from '../services/libraryStorage';
import { exportLibraryToFile, importLibraryFromFile } from '../services/libraryFile';
import { pickGameFile } from '../services/pickGameFile';
import { createGameFromPath } from '../services/createGameFromPath';
import { tauriInvoke } from '../../../services/tauri';

// Ordre de priorité pour la déduplication : Steam prime sur Epic, puis BattleNet, etc.
const PLATFORM_PRIORITY: Record<string, number> = { Steam: 0, Epic: 1, BattleNet: 2, Riot: 3, Rockstar: 4, Ubisoft: 5 };

// Normalise un titre pour la comparaison de doublons : minuscules, sans ponctuation
function normalizeName(title: string): string {
  return title.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
}

// Déduplique les jeux détectés sur plusieurs plateformes par titre normalisé
// En cas de conflit, garde la plateforme prioritaire et fusionne les données utilisateur
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

// Fusionne une liste existante avec une liste entrante en préservant les données utilisateur
// (favori, lastPlayedAt, image custom) — jamais perdues lors d'un rescan
function mergeById(prev: Game[], incoming: Game[]): Game[] {
  const map = new Map<string, Game>();
  for (const g of prev) map.set(g.id, g);

  for (const g of incoming) {
    const existing = map.get(g.id);
    if (existing) {
      map.set(g.id, {
        ...existing,
        ...g,
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

// Gère l'état complet de la bibliothèque : chargement, sauvegarde, scans et actions utilisateur
export function useLibraryGames() {
  const [games, setGames] = useState<Game[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Ref toujours synchronisée avec games pour lire la liste la plus récente dans des fonctions async
  const gamesRef = useRef<Game[]>([]);
  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  // Charge la bibliothèque depuis le stockage une seule fois au montage
  useEffect(() => {
    setGames(deduplicateGames(loadGamesFromStorage()));
  }, []);

  // Sauvegarde avec un délai de 250 ms pour grouper les changements rapides
  // Ignore le premier rendu pour ne pas écraser le stockage avec un tableau vide
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

  // Calcule le nombre de jeux installés, en favoris, et la taille totale occupée sur le disque
  const { installedCount, favoritesCount, totalSizeBytes } = useMemo(() => {
    let installed = 0;
    let favorites = 0;
    let totalSize = 0;

    for (const g of games) {
      if (g.installed) {
        installed += 1;
        if (g.sizeOnDisk) totalSize += g.sizeOnDisk;
      }
      if (g.favorite) favorites += 1;
    }

    return { installedCount: installed, favoritesCount: favorites, totalSizeBytes: totalSize };
  }, [games]);

  // Remplace la bibliothèque par les jeux d'exemple pour illustrer l'interface
  function loadSamples() {
    setGames(sampleGames.map((g) => ({ ...g, favorite: g.favorite ?? false })));
  }

  // Vide complètement la bibliothèque
  function clearLibrary() {
    setGames([]);
  }

  // Supprime un jeu par son identifiant unique
  function removeGame(id: string) {
    setGames((prev) => prev.filter((g) => g.id !== id));
  }

  // Met à jour lastPlayedAt d'un jeu avec l'horodatage actuel
  function markPlayed(id: string) {
    const nowIso = new Date().toISOString();
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, lastPlayedAt: nowIso } : g)));
  }

  // Inverse l'état favori d'un jeu
  function toggleFavorite(id: string) {
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, favorite: !g.favorite } : g)));
  }

  // Met à jour l'URL d'image personnalisée d'un jeu (null = revenir à l'image automatique)
  function setGameImageUrl(id: string, url: string | null) {
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, customImageUrl: url } : g)));
  }

  // Exporte la bibliothèque vers un fichier JSON via le dialogue natif
  async function exportToFile() {
    await exportLibraryToFile(games);
  }

  // Importe des jeux depuis un fichier JSON et les fusionne avec la bibliothèque existante
  async function importFromFile() {
    const imported = await importLibraryFromFile();
    if (imported.length === 0) return;
    setGames((prev) => mergeById(prev, imported));
  }

  // Ouvre un sélecteur de fichier pour ajouter un jeu manuellement depuis un .exe ou .lnk
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

  // Scanne les jeux Battle.net via la commande Rust et met à jour la bibliothèque
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

        // Les jeux Battle.net absents du rescan sont marqués comme non installés
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

  // Scanne les jeux Epic Games via la commande Rust et met à jour la bibliothèque
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

  // Scanne les jeux Steam via la commande Rust et met à jour la bibliothèque
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

  // Scanne les jeux Riot Games via la commande Rust et met à jour la bibliothèque
  async function scanPcRiot(): Promise<
    { ok: true; added: number } | { ok: false; message: string }
  > {
    setIsScanning(true);
    setScanError(null);
    try {
      const detected = await tauriInvoke<Game[]>('scan_riot_games');
      const normalized: Game[] = detected.map((g) => ({
        ...g,
        platform: 'Riot' as const,
        installed: true,
        favorite: g.favorite ?? false,
      }));
      let added = 0;
      const incomingIds = new Set(normalized.map((g) => g.id));
      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;
        const updated = prev.map((g) =>
          g.platform === 'Riot' && !incomingIds.has(g.id) ? { ...g, installed: false } : g,
        );
        return deduplicateGames(mergeById(updated, normalized));
      });
      return { ok: true, added };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Riot scan failed.';
      setScanError(msg);
      return { ok: false, message: msg };
    } finally {
      setIsScanning(false);
    }
  }

  // Scanne les jeux Rockstar Games via la commande Rust et met à jour la bibliothèque
  async function scanPcRockstar(): Promise<
    { ok: true; added: number } | { ok: false; message: string }
  > {
    setIsScanning(true);
    setScanError(null);
    try {
      const detected = await tauriInvoke<Game[]>('scan_rockstar_games');
      const normalized: Game[] = detected.map((g) => ({
        ...g,
        platform: 'Rockstar' as const,
        installed: true,
        favorite: g.favorite ?? false,
      }));
      let added = 0;
      const incomingIds = new Set(normalized.map((g) => g.id));
      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;
        const updated = prev.map((g) =>
          g.platform === 'Rockstar' && !incomingIds.has(g.id) ? { ...g, installed: false } : g,
        );
        return deduplicateGames(mergeById(updated, normalized));
      });
      return { ok: true, added };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rockstar scan failed.';
      setScanError(msg);
      return { ok: false, message: msg };
    } finally {
      setIsScanning(false);
    }
  }

  // Scanne les jeux Ubisoft Connect via la commande Rust et met à jour la bibliothèque
  async function scanPcUbisoft(): Promise<
    { ok: true; added: number } | { ok: false; message: string }
  > {
    setIsScanning(true);
    setScanError(null);
    try {
      const detected = await tauriInvoke<Game[]>('scan_ubisoft_games');
      const normalized: Game[] = detected.map((g) => ({
        ...g,
        platform: 'Ubisoft' as const,
        installed: true,
        favorite: g.favorite ?? false,
      }));
      let added = 0;
      const incomingIds = new Set(normalized.map((g) => g.id));
      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;
        const updated = prev.map((g) =>
          g.platform === 'Ubisoft' && !incomingIds.has(g.id) ? { ...g, installed: false } : g,
        );
        return deduplicateGames(mergeById(updated, normalized));
      });
      return { ok: true, added };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ubisoft scan failed.';
      setScanError(msg);
      return { ok: false, message: msg };
    } finally {
      setIsScanning(false);
    }
  }

  // Lance automatiquement un scan complet toutes plateformes si la bibliothèque est vide au premier rendu
  const didAutoScan = useRef(false);
  useEffect(() => {
    if (didAutoScan.current) return;
    if (games.length !== 0) return;

    didAutoScan.current = true;
    void Promise.all([
      scanPcSteam(),
      scanPcEpic(),
      scanPcBattlenet(),
      scanPcRiot(),
      scanPcRockstar(),
      scanPcUbisoft(),
    ]);
  }, [games.length]);

  return {
    games,
    isEmpty,
    installedCount,
    favoritesCount,
    totalSizeBytes,

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
    scanPcRiot,
    scanPcRockstar,
    scanPcUbisoft,
    isScanning,
    scanError,
  };
}
