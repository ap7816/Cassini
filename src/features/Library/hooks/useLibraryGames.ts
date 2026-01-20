import { useEffect, useMemo, useState } from "react";
import type { Game } from "../types";
import { sampleGames } from "../data/sampleGames";

const STORAGE_KEY = "arctive.library.games";

function safeParseGames(raw: string | null): Game[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(Boolean) as Game[];
  } catch {
    return [];
  }
}

export function useLibraryGames() {
  const [games, setGames] = useState<Game[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    setGames(safeParseGames(stored));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
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

  return {
    games,
    isEmpty,
    installedCount,
    loadSamples,
    clearLibrary,
    removeGame,
  };
}
