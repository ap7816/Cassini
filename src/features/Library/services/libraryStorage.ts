import type { Game, GamePlatform } from "../types";

const STORAGE_KEY = "arctive.library.games.v1";
const PLATFORMS: GamePlatform[] = ["Steam", "Epic", "GOG", "Other"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

export function normalizeGames(input: unknown): Game[] {
  if (!Array.isArray(input)) return [];

  return input
    .filter(isRecord)
    .map((g) => {
      const id = typeof g.id === "string" ? g.id : "";
      const title = typeof g.title === "string" ? g.title : "";
      if (!id || !title) return null;

      const platformRaw = typeof g.platform === "string" ? g.platform : "Other";
      const platform = (PLATFORMS.includes(platformRaw as GamePlatform)
        ? platformRaw
        : "Other") as GamePlatform;

      return {
        id,
        title,
        platform,
        coverUrl: typeof g.coverUrl === "string" ? g.coverUrl : null,
        installed: typeof g.installed === "boolean" ? g.installed : false,
        lastPlayedAt: typeof g.lastPlayedAt === "string" ? g.lastPlayedAt : null,
        launchUrl: typeof g.launchUrl === "string" ? g.launchUrl : null,
      } satisfies Game;
    })
    .filter(Boolean) as Game[];
}

export function loadGamesFromStorage(): Game[] {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return normalizeGames(parsed);
  } catch {
    return [];
  }
}

export function saveGamesToStorage(games: Game[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}
