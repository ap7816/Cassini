import { useEffect, useMemo, useState } from "react";
import type { Game } from "../types";
import { sampleGames } from "../data/sampleGames";
import { loadGamesFromStorage, saveGamesToStorage } from "../services/libraryStorage";
import { exportLibraryToFile, importLibraryFromFile } from "../services/libraryFile";

export function useLibraryGames() {
  const [games, setGames] = useState<Game[]>([]);

  // Load on mount
  useEffect(() => {
    setGames(loadGamesFromStorage());
  }, []);

  // Auto-save on change
  useEffect(() => {
    saveGamesToStorage(games);
  }, [games]);

  const isEmpty = games.length === 0;

  const installedCount = useMemo(
    () => games.filter((g) => g.installed).length,
    [games]
  );

  function loadSamples() {
    setGames(sampleGames);
  }

  function clearLibrary() {
    setGames([]);
  }

  function removeGame(id: string) {
    setGames((prev) => prev.filter((g) => g.id !== id));
  }

  async function exportToFile() {
    await exportLibraryToFile(games);
  }

  async function importFromFile() {
    const imported = await importLibraryFromFile();
    if (imported.length === 0) return;
    setGames(imported);
  }

  return {
    games,
    isEmpty,
    installedCount,
    loadSamples,
    clearLibrary,
    removeGame,
    exportToFile,
    importFromFile,
  };
}
