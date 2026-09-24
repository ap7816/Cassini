import { useEffect, useMemo, useRef, useState } from 'react';
import type { Game } from '../../types';
import { sampleGames } from '../data/sampleGames';
import { loadGamesFromStorage, saveGamesToStorage } from '../services/libraryStorage';
import { exportLibraryToFile, importLibraryFromFile } from '../services/libraryFile';
import { pickGameFile } from '../services/pickGameFile';
import { createGameFromPath } from '../services/createGameFromPath';
import { tauriInvoke } from '../../../services/tauri';
import { deduplicateGames, mergeById } from '../services/mergeGames';
import i18n from '../../../i18n';

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

  // Remplace les tags d'un jeu (voir services/tags.ts)
  function setGameTags(id: string, tags: string[]) {
    setGames((prev) => prev.map((g) => (g.id === id ? { ...g, tags } : g)));
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
      const msg = err instanceof Error ? err.message : i18n.t('errors.scanFailed', { platform: 'Battle.net' });
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
      const msg = err instanceof Error ? err.message : i18n.t('errors.scanFailed', { platform: 'Epic' });
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
      const msg = err instanceof Error ? err.message : i18n.t('errors.scanFailed', { platform: 'Steam' });
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
      const msg = err instanceof Error ? err.message : i18n.t('errors.scanFailed', { platform: 'Riot' });
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
      const msg = err instanceof Error ? err.message : i18n.t('errors.scanFailed', { platform: 'Rockstar' });
      setScanError(msg);
      return { ok: false, message: msg };
    } finally {
      setIsScanning(false);
    }
  }

  // Scanne les jeux Hytale via la commande Rust et met à jour la bibliothèque
  async function scanPcHytale(): Promise<
    { ok: true; added: number } | { ok: false; message: string }
  > {
    setIsScanning(true);
    setScanError(null);
    try {
      const detected = await tauriInvoke<Game[]>('scan_hytale_games');
      const normalized: Game[] = detected.map((g) => ({
        ...g,
        platform: 'Hytale' as const,
        installed: true,
        favorite: g.favorite ?? false,
      }));
      let added = 0;
      const incomingIds = new Set(normalized.map((g) => g.id));
      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;
        const updated = prev.map((g) =>
          g.platform === 'Hytale' && !incomingIds.has(g.id) ? { ...g, installed: false } : g,
        );
        return deduplicateGames(mergeById(updated, normalized));
      });
      return { ok: true, added };
    } catch (err) {
      const msg = err instanceof Error ? err.message : i18n.t('errors.scanFailed', { platform: 'Hytale' });
      setScanError(msg);
      return { ok: false, message: msg };
    } finally {
      setIsScanning(false);
    }
  }

  // Scanne les jeux HoYoPlay via la commande Rust et met à jour la bibliothèque
  async function scanPcHoYoPlay(): Promise<
    { ok: true; added: number } | { ok: false; message: string }
  > {
    setIsScanning(true);
    setScanError(null);
    try {
      const detected = await tauriInvoke<Game[]>('scan_hoyoplay_games');
      const normalized: Game[] = detected.map((g) => ({
        ...g,
        platform: 'HoYoPlay' as const,
        favorite: g.favorite ?? false,
      }));
      let added = 0;
      const incomingIds = new Set(normalized.map((g) => g.id));
      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;
        const updated = prev.map((g) =>
          g.platform === 'HoYoPlay' && !incomingIds.has(g.id) ? { ...g, installed: false } : g,
        );
        return deduplicateGames(mergeById(updated, normalized));
      });
      return { ok: true, added };
    } catch (err) {
      const msg = err instanceof Error ? err.message : i18n.t('errors.scanFailed', { platform: 'HoYoPlay' });
      setScanError(msg);
      return { ok: false, message: msg };
    } finally {
      setIsScanning(false);
    }
  }

  // Scanne les jeux Xbox via la commande Rust et met à jour la bibliothèque
  async function scanPcXbox(): Promise<
    { ok: true; added: number } | { ok: false; message: string }
  > {
    setIsScanning(true);
    setScanError(null);
    try {
      const detected = await tauriInvoke<Game[]>('scan_xbox_games');
      const normalized: Game[] = detected.map((g) => ({
        ...g,
        platform: 'Xbox' as const,
        favorite: g.favorite ?? false,
      }));
      let added = 0;
      const incomingIds = new Set(normalized.map((g) => g.id));
      setGames((prev) => {
        const before = new Set(prev.map((g) => g.id));
        for (const g of normalized) if (!before.has(g.id)) added += 1;
        const updated = prev.map((g) =>
          g.platform === 'Xbox' && !incomingIds.has(g.id) ? { ...g, installed: false } : g,
        );
        return deduplicateGames(mergeById(updated, normalized));
      });
      return { ok: true, added };
    } catch (err) {
      const msg = err instanceof Error ? err.message : i18n.t('errors.scanFailed', { platform: 'Xbox' });
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
      const msg = err instanceof Error ? err.message : i18n.t('errors.scanFailed', { platform: 'Ubisoft' });
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
    setGameTags,

    exportToFile,
    importFromFile,
    addGameFromPicker,

    scanPcSteam,
    scanPcEpic,
    scanPcBattlenet,
    scanPcRiot,
    scanPcRockstar,
    scanPcUbisoft,
    scanPcHytale,
    scanPcHoYoPlay,
    scanPcXbox,
    isScanning,
    scanError,
  };
}
