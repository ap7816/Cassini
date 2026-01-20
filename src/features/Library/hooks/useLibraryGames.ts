import { useEffect, useMemo, useState } from 'react';
import type { Game } from '../../types';
import { sampleGames } from '../data/sampleGames';
import { loadGamesFromStorage, saveGamesToStorage } from '../services/libraryStorage';
import { exportLibraryToFile, importLibraryFromFile } from '../services/libraryFile';
import { pickGameFile } from '../services/pickGameFile';
import { createGameFromPath } from '../services/createGameFromPath';

export function useLibraryGames() {
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    setGames(loadGamesFromStorage());
  }, []);

  useEffect(() => {
    saveGamesToStorage(games);
  }, [games]);

  const isEmpty = games.length === 0;

  const installedCount = useMemo(() => games.filter((g) => g.installed).length, [games]);

  function loadSamples() {
    setGames(sampleGames);
  }

  function clearLibrary() {
    setGames([]);
  }

  function removeGame(id: string) {
    setGames((prev) => prev.filter((g) => g.id !== id));
  }

  function toggleInstalled(id: string) {
    setGames((prev) =>
      prev.map((g) => (g.id === id ? { ...g, installed: !Boolean(g.installed) } : g)),
    );
  }

  async function exportToFile() {
    await exportLibraryToFile(games);
  }

  async function importFromFile() {
    const imported = await importLibraryFromFile();
    if (imported.length === 0) return;
    setGames(imported);
  }

  async function addGameFromPicker(): Promise<{ ok: true } | { ok: false; message: string }> {
    const picked = await pickGameFile();
    if (!picked.ok) {
      // CANCELLED = pas une erreur bloquante
      if (picked.reason === 'CANCELLED') return { ok: false, message: 'Cancelled.' };
      return { ok: false, message: picked.message };
    }

    const newGame = createGameFromPath(picked.path);

    setGames((prev) => {
      // si le jeu existe déjà (même id = même path), on le remplace/refresh
      const exists = prev.some((g) => g.id === newGame.id);
      if (exists) return prev.map((g) => (g.id === newGame.id ? { ...g, ...newGame } : g));
      return [newGame, ...prev];
    });

    return { ok: true };
  }

  return {
    games,
    isEmpty,
    installedCount,
    loadSamples,
    clearLibrary,
    removeGame,
    toggleInstalled,
    exportToFile,
    importFromFile,
    addGameFromPicker, // NEW
  };
}
