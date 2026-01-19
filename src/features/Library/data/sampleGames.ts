import type { Game } from "../types";

export const sampleGames: Game[] = [
  {
    id: "steam-367520",
    title: "Hollow Knight",
    platform: "Steam",
    installed: true,
    lastPlayedAt: "2026-01-10T18:20:00.000Z",
    launchUrl: "steam://rungameid/367520",
  },
  {
    id: "epic-hades",
    title: "Hades",
    platform: "Epic",
    installed: false,
    lastPlayedAt: null,
    launchUrl: "com.epicgames.launcher://apps/Hades?action=launch&silent=true",
  },
  {
    id: "gog-cyberpunk",
    title: "Cyberpunk 2077",
    platform: "GOG",
    installed: true,
    lastPlayedAt: "2026-01-15T21:05:00.000Z",
    launchUrl: "goggalaxy://launch/1423049311",
  },
  {
    id: "other-stardew",
    title: "Stardew Valley",
    platform: "Other",
    installed: true,
    lastPlayedAt: "2026-01-18T12:00:00.000Z",
    launchUrl: null,
  },
];
